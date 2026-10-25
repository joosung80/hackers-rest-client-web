'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { StreamLanguage, syntaxHighlighting, HighlightStyle, foldGutter, codeFolding } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { tags as t } from '@lezer/highlight'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import type { SentRequest } from '@/lib/variables'
import { toCurl } from '@/lib/variables'

export type ResultState =
  | { kind: 'idle' }
  | { kind: 'loading'; title: string; started: number }
  | {
      kind: 'done'
      title: string
      mode: 'server' | 'direct'
      sent: SentRequest
      status: number
      statusText: string
      headers: [string, string][]
      body: string
      bodyEncoding: 'text' | 'base64'
      size: number
      elapsed: number
      truncated?: boolean
      warnings: string[]
    }
  | { kind: 'error'; title: string; message: string; hint?: string; sent?: SentRequest; warnings: string[] }

const rawLang = StreamLanguage.define<{ phase: 'status' | 'headers' | 'body' }>({
  startState: () => ({ phase: 'status' }),
  token(stream, s) {
    if (s.phase === 'status') {
      if (stream.match(/^[A-Z]+ \S+/) || stream.match(/^HTTP\/\S+/)) return 'meta'
      if (stream.match(/^\s*\d{3}/)) return 'number'
      stream.skipToEnd()
      s.phase = 'headers'
      return 'string'
    }
    if (s.phase === 'headers') {
      if (stream.sol() && stream.match(/^[^:]+(?=:)/)) return 'propertyName'
      stream.skipToEnd()
      return null
    }
    if (stream.match(/"(?:[^"\\]|\\.)*"(?=\s*:)/)) return 'propertyName'
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string'
    if (stream.match(/-?\d+(\.\d+)?/)) return 'number'
    if (stream.match(/\b(true|false|null)\b/)) return 'atom'
    if (stream.match(/<\/?[\w:-]+/)) return 'tag'
    stream.next()
    return null
  },
  blankLine(s) {
    if (s.phase !== 'status') s.phase = 'body'
  },
  tokenTable: { meta: t.meta, number: t.number, string: t.string, propertyName: t.propertyName, atom: t.atom, tag: t.tagName },
})

const rawHighlight = HighlightStyle.define([
  { tag: t.meta, color: '#c586c0', fontWeight: '700' },
  { tag: t.number, color: '#b5cea8' },
  { tag: t.string, color: '#ce9178' },
  { tag: t.propertyName, color: '#f48771' },
  { tag: t.atom, color: '#569cd6' },
  { tag: t.tagName, color: '#569cd6' },
])

const viewTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--ed-bg)', color: '#d4d4d4' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'var(--ed-bg)', color: '#6e7681', border: 'none' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
)

function ReadOnlyCode({ text, lang, fontSize }: { text: string; lang: 'raw' | 'json' | 'xml' | 'html' | 'text'; fontSize: number }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const langComp = useRef(new Compartment())
  const fontComp = useRef(new Compartment())

  const langExt = (l: typeof lang) =>
    l === 'json' ? [json(), syntaxHighlighting(oneDarkHighlightStyle)]
    : l === 'xml' ? [xml(), syntaxHighlighting(oneDarkHighlightStyle)]
    : l === 'html' ? [html(), syntaxHighlighting(oneDarkHighlightStyle)]
    : l === 'raw' ? [rawLang, syntaxHighlighting(rawHighlight)]
    : []

  useEffect(() => {
    if (!host.current) return
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          codeFolding(),
          foldGutter(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          viewTheme,
          langComp.current.of(langExt(lang)),
          fontComp.current.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
        ],
      }),
    })
    return () => view.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const v = view.current
    if (!v) return
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: text },
      effects: langComp.current.reconfigure(langExt(lang)),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, lang])

  useEffect(() => {
    view.current?.dispatch({ effects: fontComp.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })) })
  }, [fontSize])

  return <div ref={host} className="editor-host" />
}

function prettyBody(body: string, ct: string): { text: string; lang: 'json' | 'xml' | 'html' | 'text' } {
  const c = ct.toLowerCase()
  if (c.includes('json') || /^\s*[{[]/.test(body)) {
    try {
      return { text: JSON.stringify(JSON.parse(body), null, 2), lang: 'json' }
    } catch {
      /* 그대로 */
    }
  }
  if (c.includes('html')) return { text: body, lang: 'html' }
  if (c.includes('xml') || c.includes('rss') || /^\s*<\?xml/.test(body)) return { text: body, lang: 'xml' }
  return { text: body, lang: 'text' }
}

const STATUS_HINT: Record<string, string> = {
  '2': '✅ 성공 — 주방이 "주문 잘 받았습니다"',
  '3': '↪️ 다른 주소로 안내 (리다이렉트)',
  '4': '🙋 내 쪽 확인 필요 — 주소·방식·내용을 다시 봐요',
  '5': '🔥 상대 서버 쪽 문제',
}
const STATUS_TIPS: Record<number, string> = {
  400: '보낸 내용(본문·형식)이 잘못됐어요. JSON 문법과 Content-Type 을 확인하세요.',
  401: '로그인/인증이 필요해요. Authorization 헤더를 확인하세요.',
  403: '권한이 없어요.',
  404: '그런 창구(주소)가 없어요. n8n 이라면 ① 경로 오타 ② 테스트 URL 은 "Listen for test event" 를 먼저 ③ 운영 URL 은 Publish 했는지 ④ 방식(POST/GET)이 맞는지 확인!',
  405: '이 주소는 그 방식(GET/POST)을 받지 않아요.',
  429: '너무 자주 보냈어요. 잠시 후 다시.',
  500: '상대 서버 내부 오류예요. n8n 이라면 워크플로우 실행 기록(Executions)을 확인하세요.',
}

export default function ResponseView({ result, fontSize }: { result: ResultState; fontSize: number }) {
  const [tab, setTab] = useState<'all' | 'body' | 'headers' | 'request'>('all')
  const [copied, setCopied] = useState('')

  const view = useMemo(() => {
    if (result.kind !== 'done') return null
    const ct = result.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
    const isBin = result.bodyEncoding === 'base64'
    const body = isBin ? `(이진 파일 ${result.size.toLocaleString()} bytes — 미리보기 생략)` : result.body
    const pb = isBin ? { text: body, lang: 'text' as const } : prettyBody(body, ct)
    const headerText = result.headers.map(([k, v]) => `${k}: ${v}`).join('\n')
    const all = `HTTP/1.1 ${result.status} ${result.statusText}\n${headerText}\n\n${pb.text}`
    const s = result.sent
    const reqText = `${s.method} ${s.url}\n${s.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}${s.body ? `\n\n${s.body}` : ''}`
    return { all, body: pb, headerText, reqText }
  }, [result])

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* 무시 */
    }
  }

  if (result.kind === 'idle')
    return (
      <div className="resp-empty">
        <div className="resp-empty-icon">📮</div>
        <p>
          왼쪽에서 요청 위의 <b>▶ Send Request</b> 를 누르면
          <br />
          여기에 <b>영수증(상태코드)</b>과 <b>답장(응답)</b>이 나와요.
        </p>
        <p className="muted">단축키: 요청 안에 커서를 두고 Ctrl/⌘ + Enter</p>
      </div>
    )

  if (result.kind === 'loading')
    return (
      <div className="resp-empty">
        <div className="spinner" />
        <p>
          <b>{result.title}</b> 보내는 중…
        </p>
      </div>
    )

  if (result.kind === 'error')
    return (
      <div className="resp-error">
        <div className="resp-title">{result.title}</div>
        <div className="err-box">
          <b>⚠️ {result.message}</b>
          {result.hint && <p>{result.hint}</p>}
        </div>
        {result.warnings.map((w, i) => (
          <div key={i} className="warn">
            💡 {w}
          </div>
        ))}
        {result.sent && (
          <pre className="sent-pre">
            {result.sent.method} {result.sent.url}
          </pre>
        )}
      </div>
    )

  const r = result
  const cls = `s${String(r.status)[0]}`
  const tip = STATUS_TIPS[r.status]
  return (
    <div className="resp">
      <div className="resp-bar">
        <span className={`status ${cls}`}>
          {r.status} {r.statusText}
        </span>
        <span className="meta">⏱ {r.elapsed.toLocaleString()} ms</span>
        <span className="meta">📦 {fmtSize(r.size)}</span>
        <span className={`meta mode ${r.mode}`}>{r.mode === 'server' ? '🛰️ 서버 경유' : '🌐 브라우저 직접'}</span>
        <span className="resp-title-inline" title={r.title}>
          {r.title}
        </span>
      </div>
      <div className={`status-hint ${cls}`}>
        {STATUS_HINT[String(r.status)[0]]}
        {tip && <span> · {tip}</span>}
      </div>
      {r.warnings.map((w, i) => (
        <div key={i} className="warn">
          💡 {w}
        </div>
      ))}
      {r.truncated && <div className="warn">💡 응답이 커서 앞쪽 5MB 만 보여요</div>}
      <div className="tabs">
        {(
          [
            ['all', '전체 (VS Code 처럼)'],
            ['body', '본문'],
            ['headers', `헤더 ${r.headers.length}`],
            ['request', '보낸 요청'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
        <span className="grow" />
        <button className="ghost" onClick={() => copy('본문', r.body)}>
          {copied === '본문' ? '복사됨 ✓' : '본문 복사'}
        </button>
        <button className="ghost" onClick={() => copy('cURL', toCurl(r.sent))}>
          {copied === 'cURL' ? '복사됨 ✓' : 'cURL 복사'}
        </button>
      </div>
      <div className="resp-body">
        {view && tab === 'all' && <ReadOnlyCode key="all" text={view.all} lang="raw" fontSize={fontSize} />}
        {view && tab === 'body' && <ReadOnlyCode key="body" text={view.body.text} lang={view.body.lang} fontSize={fontSize} />}
        {view && tab === 'headers' && <ReadOnlyCode key="h" text={view.headerText} lang="text" fontSize={fontSize} />}
        {view && tab === 'request' && <ReadOnlyCode key="r" text={view.reqText} lang="text" fontSize={fontSize} />}
      </div>
    </div>
  )
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
