// {{변수}} 치환 + 보낼 요청 완성
import type { ParsedRequest } from './parser'

export type SentRequest = { method: string; url: string; headers: [string, string][]; body: string }
export type ReceivedResponse = {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
}
export type NamedResult = { request: SentRequest; response?: ReceivedResponse }

export type VarContext = {
  fileVars: Record<string, string>
  envVars: Record<string, string>
  named: Record<string, NamedResult>
  prompts: Record<string, string>
}

export type ResolveResult = { value: string; warnings: string[] }

const VAR = /\{\{\s*(.+?)\s*\}\}/g

export function resolveText(text: string, ctx: VarContext, depth = 0): ResolveResult {
  const warnings: string[] = []
  const value = text.replace(VAR, (whole, expr: string) => {
    const r = resolveExpr(expr.trim(), ctx, depth)
    if (r === undefined) {
      warnings.push(`변수 {{${expr}}} 값을 찾지 못했어요`)
      return whole
    }
    return r
  })
  return { value, warnings }
}

function resolveExpr(expr: string, ctx: VarContext, depth: number): string | undefined {
  if (depth > 10) return undefined
  if (expr.startsWith('$')) return systemVar(expr)
  if (expr in ctx.prompts) return ctx.prompts[expr]
  // 요청 변수: name.response.body.$.x / name.response.headers.X
  const rv = expr.match(/^([\w-]+)\.(request|response)\.(headers|body)\.?(.*)$/)
  if (rv && ctx.named[rv[1]]) return requestVar(ctx.named[rv[1]], rv[2] as 'request' | 'response', rv[3] as 'headers' | 'body', rv[4])
  if (expr in ctx.fileVars) return resolveText(ctx.fileVars[expr], ctx, depth + 1).value
  if (expr in ctx.envVars) return resolveText(ctx.envVars[expr], ctx, depth + 1).value
  return undefined
}

function requestVar(r: NamedResult, part: 'request' | 'response', kind: 'headers' | 'body', path: string): string | undefined {
  const src = part === 'request' ? r.request : r.response
  if (!src) return undefined
  if (kind === 'headers') {
    const h = src.headers.find(([k]) => k.toLowerCase() === path.toLowerCase())
    return h?.[1]
  }
  if (!path || path === '*') return src.body
  if (path.startsWith('$')) {
    try {
      const v = jsonPath(JSON.parse(src.body), path)
      if (v === undefined) return undefined
      return typeof v === 'string' ? v : JSON.stringify(v)
    } catch {
      return undefined
    }
  }
  return undefined
}

/** 간단 JSONPath: $.a.b[0].c , $['a'] , $[0] */
export function jsonPath(obj: unknown, path: string): unknown {
  const parts: (string | number)[] = []
  path
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[['"]([^'"]+)['"]\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .forEach((p) => parts.push(/^\d+$/.test(p) ? Number(p) : p))
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = (cur as Record<string | number, unknown>)[p]
  }
  return cur
}

// ---------- 시스템 변수 ----------
function systemVar(expr: string): string | undefined {
  const [name, ...args] = splitArgs(expr)
  switch (name) {
    case '$guid':
      return crypto.randomUUID()
    case '$randomInt': {
      const min = Number(args[0] ?? 0)
      const max = Number(args[1] ?? 1000)
      return String(Math.floor(Math.random() * (max - min)) + min)
    }
    case '$timestamp': {
      const d = withOffset(new Date(), args[0], args[1])
      return String(Math.floor(d.getTime() / 1000))
    }
    case '$datetime':
    case '$localDatetime': {
      const fmt = args[0] ?? 'iso8601'
      const d = withOffset(new Date(), args[1], args[2])
      return formatDate(d, fmt, name === '$localDatetime')
    }
    case '$processEnv':
    case '$dotenv':
      return undefined
    default:
      return undefined
  }
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

function withOffset(d: Date, amount?: string, unit?: string): Date {
  if (!amount || !unit) return d
  const n = Number(amount)
  const ms: Record<string, number> = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }
  if (unit === 'M') {
    const x = new Date(d)
    x.setMonth(x.getMonth() + n)
    return x
  }
  if (unit === 'y') {
    const x = new Date(d)
    x.setFullYear(x.getFullYear() + n)
    return x
  }
  return new Date(d.getTime() + n * (ms[unit] ?? 0))
}

function formatDate(d: Date, fmt: string, local: boolean): string {
  if (fmt === 'iso8601') {
    if (!local) return d.toISOString()
    const off = -d.getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
    const base = new Date(d.getTime() + off * 6e4).toISOString().slice(0, 23)
    return `${base}${sign}${pad(off / 60)}:${pad(off % 60)}`
  }
  if (fmt === 'rfc1123') return d.toUTCString()
  const get = local
    ? { Y: d.getFullYear(), M: d.getMonth() + 1, D: d.getDate(), H: d.getHours(), m: d.getMinutes(), s: d.getSeconds() }
    : { Y: d.getUTCFullYear(), M: d.getUTCMonth() + 1, D: d.getUTCDate(), H: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() }
  const p = (n: number) => String(n).padStart(2, '0')
  return fmt
    .replace(/YYYY/g, String(get.Y))
    .replace(/MM/g, p(get.M))
    .replace(/DD/g, p(get.D))
    .replace(/HH/g, p(get.H))
    .replace(/mm/g, p(get.m))
    .replace(/ss/g, p(get.s))
}

// ---------- 보낼 요청 완성 ----------
export function buildRequest(req: ParsedRequest, ctx: VarContext): { sent: SentRequest; warnings: string[] } {
  const warnings: string[] = []
  const r = (s: string) => {
    const x = resolveText(s, ctx)
    warnings.push(...x.warnings)
    return x.value
  }
  let url = r(req.url)
  let headers: [string, string][] = req.headers.map(([k, v]) => [r(k), r(v)])
  let body = r(req.body)

  if (!/^https?:\/\//i.test(url)) {
    // REST Client 처럼 Host 헤더 + 경로 조합 지원
    const host = headers.find(([k]) => k.toLowerCase() === 'host')?.[1]
    if (host && url.startsWith('/')) url = `https://${host}${url}`
    else warnings.push('주소는 http:// 또는 https:// 로 시작해야 해요')
  }
  // 공백이 들어간 쿼리값 인코딩
  try {
    url = new URL(url).toString()
  } catch {
    /* 그대로 */
  }

  // Basic 인증: "Basic user:pass" 또는 "Basic user pass" → base64
  headers = headers.map(([k, v]) => {
    if (k.toLowerCase() === 'authorization') {
      const m = v.match(/^Basic\s+(\S+)(?:\s+(\S+))?$/i)
      if (m) {
        const raw = m[2] !== undefined ? `${m[1]}:${m[2]}` : m[1]
        if (raw.includes(':')) return [k, 'Basic ' + b64(raw)]
      }
    }
    return [k, v]
  })

  const ct = headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1]?.toLowerCase() ?? ''
  const reqType = headers.find(([k]) => k.toLowerCase() === 'x-request-type')?.[1]?.toLowerCase()

  if (reqType === 'graphql') {
    const parts = body.split(/\n\s*\n/)
    const query = parts[0]
    let variables: unknown = undefined
    if (parts[1]) {
      try {
        variables = JSON.parse(parts.slice(1).join('\n\n'))
      } catch {
        warnings.push('GraphQL variables 가 올바른 JSON 이 아니에요')
      }
    }
    body = JSON.stringify(variables === undefined ? { query } : { query, variables })
    headers = headers.filter(([k]) => k.toLowerCase() !== 'x-request-type')
    if (!ct) headers.push(['Content-Type', 'application/json'])
  } else if (ct.includes('application/x-www-form-urlencoded')) {
    body = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('')
  } else if (ct.includes('multipart/form-data')) {
    if (/^<\s+\S/m.test(body)) warnings.push('웹 버전은 파일 첨부(< ./파일)를 지원하지 않아요 — 텍스트 값만 보내요')
    body = body.replace(/^<\s+.*$/gm, '(파일 첨부 생략)').replace(/\r?\n/g, '\r\n')
  } else if (/^<\s+\S/.test(body.trim())) {
    warnings.push('웹 버전은 파일 본문(< ./파일)을 지원하지 않아요')
  }

  if (body && ['GET', 'HEAD'].includes(req.method)) {
    warnings.push(`${req.method} 요청은 본문을 보낼 수 없어서 본문을 뺐어요`)
    body = ''
  }

  return { sent: { method: req.method, url, headers, body }, warnings }
}

function b64(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

/** 내 PC · 사내망 주소인지 (서버가 들어갈 수 없는 곳) */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1') return true
    const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
    if (!m) return false
    const a = Number(m[1]), b = Number(m[2])
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
  } catch {
    return false
  }
}

/** Windows PowerShell 에서 같은 요청을 보내는 명령 */
export function toPowerShell(s: SentRequest): string {
  const q = (x: string) => `'${x.replace(/'/g, "''")}'`
  const hdr = s.headers.filter(([k]) => k.toLowerCase() !== 'content-type')
  const ct = s.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1]
  const lines = [`$headers = @{ ${hdr.map(([k, v]) => `${q(k)} = ${q(v)}`).join('; ')} }`]
  let cmd = `Invoke-RestMethod -Method ${s.method} -Uri ${q(s.url)} -Headers $headers`
  if (s.body) {
    lines.push(`$body = [System.Text.Encoding]::UTF8.GetBytes(@'\n${s.body}\n'@)`)
    cmd += ` -ContentType ${q((ct || 'application/json') + (/charset/i.test(ct || '') ? '' : '; charset=utf-8'))} -Body $body`
  }
  lines.push(cmd + ' | ConvertTo-Json -Depth 10')
  return lines.join('\n')
}

export function toCurl(s: SentRequest): string {
  const q = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`
  const parts = [`curl -X ${s.method} ${q(s.url)}`]
  for (const [k, v] of s.headers) parts.push(`  -H ${q(`${k}: ${v}`)}`)
  if (s.body) parts.push(`  --data-raw ${q(s.body)}`)
  return parts.join(' \\\n')
}
