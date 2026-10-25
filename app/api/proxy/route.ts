// 서버 경유 요청 — 브라우저 대신 서버가 보내므로 CORS 와 무관
import { NextResponse } from 'next/server'
import { lookup } from 'node:dns/promises'
import net from 'node:net'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_REQ_BODY = 1 * 1024 * 1024 // 1MB
const MAX_RES_BODY = 5 * 1024 * 1024 // 5MB
const TIMEOUT_MS = 20_000
const RATE_LIMIT = 600 // IP 당 분당 요청 수 — 강의장 50명이 공인 IP 하나를 공유해도 넉넉하게 (인스턴스 단위)

const hits = new Map<string, { count: number; reset: number }>()

const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
  303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  408: 'Request Timeout', 409: 'Conflict', 413: 'Payload Too Large', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
}

// 요청에서 빼거나 서버가 정하는 헤더
const DROP_REQ_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'expect'])

type ProxyBody = {
  method: string
  url: string
  headers: [string, string][]
  body?: string
  followRedirects?: boolean
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim()
  if (!rateOk(ip)) return err(429, '요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요.')

  const raw = await req.text()
  if (raw.length > MAX_REQ_BODY + 64 * 1024) return err(413, '보내는 내용이 너무 커요 (최대 1MB).')
  let p: ProxyBody
  try {
    p = JSON.parse(raw)
  } catch {
    return err(400, '잘못된 요청 형식이에요.')
  }

  let target: URL
  try {
    target = new URL(p.url)
  } catch {
    return err(400, `주소를 이해하지 못했어요: ${p.url}`)
  }
  if (!['http:', 'https:'].includes(target.protocol)) return err(400, 'http:// 또는 https:// 주소만 보낼 수 있어요.')

  const blocked = await isPrivateHost(target.hostname)
  if (blocked)
    return err(
      403,
      `"${target.hostname}" 은(는) 내 PC·사내망 주소라 서버가 갈 수 없어요. ⚙️ 설정 → 요청 방식을 "브라우저 직접"으로 바꿔 보세요.`,
    )

  const method = (p.method || 'GET').toUpperCase()
  const headers = new Headers()
  for (const [k, v] of p.headers ?? []) {
    if (!k || DROP_REQ_HEADERS.has(k.toLowerCase())) continue
    try {
      headers.append(k, v)
    } catch {
      return err(400, `헤더를 보낼 수 없어요: ${k}`)
    }
  }
  if (!headers.has('user-agent')) headers.set('user-agent', 'rest-client-web/1.0 (+https://hackers-rest-client.vercel.app)')

  const started = performance.now()
  let res: Response
  try {
    res = await fetch(target, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : p.body ?? '',
      redirect: p.followRedirects === false ? 'manual' : 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'TimeoutError' ? `${TIMEOUT_MS / 1000}초 안에 응답이 없어요.` : e.message) : String(e)
    const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : ''
    return err(502, `상대 서버에 연결하지 못했어요: ${msg}${cause}`)
  }

  // 본문 (최대 5MB)
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RES_BODY) {
        truncated = true
        await reader.cancel()
        break
      }
      chunks.push(value)
    }
  }
  const elapsed = Math.round(performance.now() - started)
  const buf = Buffer.concat(chunks)
  const ct = res.headers.get('content-type') ?? ''
  const isText = /json|xml|html|text|javascript|csv|yaml|rss|atom|x-www-form-urlencoded|graphql/i.test(ct) || (!ct && looksText(buf))

  const outHeaders: [string, string][] = []
  res.headers.forEach((v, k) => {
    if (k !== 'set-cookie') outHeaders.push([k, v])
  })
  for (const c of res.headers.getSetCookie?.() ?? []) outHeaders.push(['set-cookie', c])

  return NextResponse.json({
    ok: true,
    status: res.status,
    statusText: res.statusText || STATUS_TEXT[res.status] || '',
    url: res.url,
    redirected: res.redirected,
    headers: outHeaders,
    body: isText ? buf.toString('utf8') : buf.toString('base64'),
    bodyEncoding: isText ? 'text' : 'base64',
    size,
    truncated,
    elapsed,
  })
}

function err(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function rateOk(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 })
    if (hits.size > 5000) hits.clear()
    return true
  }
  h.count++
  return h.count <= RATE_LIMIT
}

function looksText(buf: Buffer) {
  const sample = buf.subarray(0, 512)
  for (const b of sample) if (b === 0) return false
  return true
}

async function isPrivateHost(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  let addrs: string[] = []
  if (net.isIP(h)) addrs = [h]
  else {
    try {
      addrs = (await lookup(h, { all: true })).map((a) => a.address)
    } catch {
      return false // 이름 풀이 실패는 fetch 단계에서 오류로 안내
    }
  }
  return addrs.some(isPrivateIp)
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) || // 링크로컬 · 클라우드 메타데이터
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT · Tailscale
      a >= 224
    )
  }
  const x = ip.toLowerCase()
  if (x.startsWith('::ffff:')) return isPrivateIp(x.slice(7))
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80')
}
