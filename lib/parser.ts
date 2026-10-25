// VS Code REST Client(.http) 문법 파서
// 지원: ### 구분 · # @name/@prompt/@no-redirect · @변수 = 값 · METHOD URL HTTP/x
//       여러 줄 쿼리(? / &) · 헤더 · 본문 · cURL 붙여넣기 · # / // 주석

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'] as const

export type PromptVar = { name: string; description?: string }

export type ParsedRequest = {
  index: number
  /** 요청 줄(METHOD URL)의 0-based 줄 번호 — "Send Request" 위치 */
  line: number
  /** 블록 범위 (0-based, inclusive) */
  startLine: number
  endLine: number
  title?: string // ### 뒤 설명
  name?: string // # @name
  prompts: PromptVar[]
  noRedirect: boolean
  noCookieJar: boolean
  method: string
  url: string
  headers: [string, string][]
  body: string
  isCurl: boolean
  errors: string[]
}

export type ParsedFile = {
  requests: ParsedRequest[]
  fileVariables: Record<string, string>
}

const REQUEST_LINE = new RegExp(`^(${METHODS.join('|')})\\s+(.+?)(?:\\s+HTTP\\/[\\d.]+)?\\s*$`, 'i')
const URL_ONLY = /^(https?:\/\/|\{\{|\/)\S*/i
const FILE_VAR = /^@([A-Za-z_][\w.-]*)\s*=\s*(.*)$/
const META = /^(?:#|\/\/)\s*@([\w-]+)\s*(.*)$/
const COMMENT = /^\s*(#|\/\/)/
const HEADER = /^([^\s:][^:]*?)\s*:\s*(.*)$/

export function parseHttpFile(text: string): ParsedFile {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const fileVariables: Record<string, string> = {}
  const requests: ParsedRequest[] = []

  // 블록 나누기
  const blocks: { start: number; end: number; title?: string }[] = []
  let start = 0
  let title: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###(.*)$/)
    if (m) {
      if (i > start || blocks.length === 0) blocks.push({ start, end: i - 1, title })
      start = i + 1
      title = m[1].trim() || undefined
    }
  }
  blocks.push({ start, end: lines.length - 1, title })

  for (const b of blocks) {
    if (b.end < b.start) continue
    let i = b.start
    const meta: { name?: string; prompts: PromptVar[]; noRedirect: boolean; noCookieJar: boolean } = {
      prompts: [],
      noRedirect: false,
      noCookieJar: false,
    }

    // 요청 줄 이전: 빈 줄 · 주석 · 메타 · 파일 변수
    for (; i <= b.end; i++) {
      const raw = lines[i]
      const t = raw.trim()
      if (!t) continue
      const fv = t.match(FILE_VAR)
      if (fv) {
        fileVariables[fv[1]] = fv[2].trim()
        continue
      }
      const mm = t.match(META)
      if (mm) {
        const key = mm[1].toLowerCase()
        const val = mm[2].trim()
        if (key === 'name') meta.name = val.split(/\s+/)[0]
        else if (key === 'prompt') {
          const [n, ...rest] = val.split(/\s+/)
          if (n) meta.prompts.push({ name: n, description: rest.join(' ') || undefined })
        } else if (key === 'no-redirect') meta.noRedirect = true
        else if (key === 'no-cookie-jar') meta.noCookieJar = true
        continue
      }
      if (COMMENT.test(raw)) continue
      break
    }
    if (i > b.end) continue // 요청 없음 (변수만 있는 블록)

    const reqLine = i
    const first = lines[i].trim()
    const req: ParsedRequest = {
      index: requests.length,
      line: reqLine,
      startLine: b.start,
      endLine: b.end,
      title: b.title,
      name: meta.name,
      prompts: meta.prompts,
      noRedirect: meta.noRedirect,
      noCookieJar: meta.noCookieJar,
      method: 'GET',
      url: '',
      headers: [],
      body: '',
      isCurl: false,
      errors: [],
    }

    // cURL 붙여넣기
    if (/^curl\s/i.test(first)) {
      let cmd = ''
      for (; i <= b.end; i++) {
        const l = lines[i]
        if (!l.trim() && cmd) break
        cmd += l.replace(/\\\s*$/, ' ') + ' '
        if (!/\\\s*$/.test(l)) {
          i++
          break
        }
      }
      Object.assign(req, parseCurl(cmd), { isCurl: true })
      requests.push(req)
      continue
    }

    const rm = first.match(REQUEST_LINE)
    if (rm) {
      req.method = rm[1].toUpperCase()
      req.url = rm[2].trim()
    } else if (URL_ONLY.test(first)) {
      req.method = 'GET'
      req.url = first.replace(/\s+HTTP\/[\d.]+\s*$/i, '')
    } else {
      req.errors.push(`요청 줄을 이해하지 못했어요: "${first}" — 예) GET https://example.com`)
      req.url = first
    }
    i++

    // 여러 줄 쿼리 (? / & 로 시작)
    for (; i <= b.end; i++) {
      const t = lines[i].trim()
      if (/^[?&]/.test(t)) req.url += t
      else break
    }

    // 헤더
    for (; i <= b.end; i++) {
      const raw = lines[i]
      const t = raw.trim()
      if (!t) {
        i++
        break
      }
      if (COMMENT.test(raw)) continue
      const hm = t.match(HEADER)
      if (hm) req.headers.push([hm[1].trim(), hm[2].trim()])
      else {
        // 빈 줄 없이 바로 본문이 시작된 경우
        break
      }
    }

    // 본문 (블록 끝까지, 뒤쪽 빈 줄 제거)
    const bodyLines = lines.slice(i, b.end + 1)
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop()
    req.body = bodyLines.join('\n')
    requests.push(req)
  }

  return { requests, fileVariables }
}

/** 간단한 cURL 파서: -X, -H, -d/--data*, -u, --json, -F, URL */
export function parseCurl(cmd: string): Pick<ParsedRequest, 'method' | 'url' | 'headers' | 'body' | 'errors'> {
  const tokens = shellSplit(cmd.trim())
  const out = { method: '', url: '', headers: [] as [string, string][], body: '', errors: [] as string[] }
  const data: string[] = []
  const form: string[] = []
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    const next = () => tokens[++i] ?? ''
    if (t === '-X' || t === '--request') out.method = next().toUpperCase()
    else if (t === '-H' || t === '--header') {
      const h = next()
      const idx = h.indexOf(':')
      if (idx > 0) out.headers.push([h.slice(0, idx).trim(), h.slice(idx + 1).trim()])
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode'].includes(t)) data.push(next())
    else if (t === '--json') {
      data.push(next())
      out.headers.push(['Content-Type', 'application/json'], ['Accept', 'application/json'])
    } else if (t === '-u' || t === '--user') out.headers.push(['Authorization', 'Basic ' + next()])
    else if (t === '-F' || t === '--form') form.push(next())
    else if (t === '-G' || t === '--get') out.method = 'GET'
    else if (t === '--url') out.url = next()
    else if (/^-/.test(t)) {
      // 값을 받는 기타 옵션은 건너뛰기
      if (['-o', '--output', '-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '-m', '--max-time'].includes(t)) {
        const v = next()
        if (t === '-A' || t === '--user-agent') out.headers.push(['User-Agent', v])
        if (t === '-b' || t === '--cookie') out.headers.push(['Cookie', v])
        if (t === '-e' || t === '--referer') out.headers.push(['Referer', v])
      }
    } else if (!out.url) out.url = t
  }
  if (form.length) {
    const boundary = '----RestClientWebBoundary'
    out.headers.push(['Content-Type', `multipart/form-data; boundary=${boundary}`])
    out.body =
      form
        .map((f) => {
          const [k, ...v] = f.split('=')
          return `--${boundary}\nContent-Disposition: form-data; name="${k}"\n\n${v.join('=')}`
        })
        .join('\n') + `\n--${boundary}--`
  } else if (data.length) {
    out.body = data.join('&')
    if (!out.headers.some(([k]) => k.toLowerCase() === 'content-type'))
      out.headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
  }
  if (!out.method) out.method = out.body ? 'POST' : 'GET'
  if (!out.url) out.errors.push('cURL 명령에서 URL 을 찾지 못했어요.')
  return out
}

function shellSplit(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  let has = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]
      else cur += c
    } else if (c === '"' || c === "'") {
      q = c
      has = true
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur)
      cur = ''
      has = false
    } else if (c === '\\' && i + 1 < s.length) cur += s[++i]
    else cur += c
  }
  if (cur || has) out.push(cur)
  return out
}

/** 커서가 있는 줄에 해당하는 요청 */
export function requestAtLine(file: ParsedFile, line: number): ParsedRequest | undefined {
  return file.requests.find((r) => line >= r.startLine && line <= r.endLine)
}
