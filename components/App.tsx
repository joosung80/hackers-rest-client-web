'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HttpEditor from './HttpEditor'
import ResponseView, { type ResultState } from './ResponseView'
import SettingsDialog, { type Settings, DEFAULT_SETTINGS, parseExtraVars } from './SettingsDialog'
import HelpDrawer from './HelpDrawer'
import { EXAMPLES, INSTRUCTOR } from '@/lib/examples'
import { parseHttpFile, type ParsedRequest } from '@/lib/parser'
import { buildRequest, type NamedResult, type SentRequest } from '@/lib/variables'

const LS_FILES = 'rcw.files.v1'
const LS_SETTINGS = 'rcw.settings.v1'
const LS_CURRENT = 'rcw.current.v1'
const SCRATCH_ID = 'scratch'
const SHARED_ID = 'shared'

type FileEntry = { id: string; title: string; desc: string; content: string; builtin: boolean }

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...JSON.parse(v) } : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* 저장 불가 환경 */
  }
}

async function encodeShare(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  buf.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function decodeShare(code: string): Promise<string> {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}

export default function App() {
  const builtins: FileEntry[] = useMemo(
    () => [
      ...EXAMPLES.map((e) => ({ ...e, builtin: true })),
      { id: SCRATCH_ID, title: '📝 내 메모장', desc: '자유롭게 써 보는 빈 파일 (브라우저에 저장)', content: '### 여기에 직접 써 보세요\nGET https://jsonplaceholder.typicode.com/users/1\n', builtin: false },
    ],
    [],
  )
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [shared, setShared] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string>('lecture1')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState<ResultState>({ kind: 'idle' })
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [toast, setToast] = useState('')
  const [jump, setJump] = useState<{ line: number; nonce: number } | undefined>()
  const [split, setSplit] = useState(50)
  const named = useRef<Record<string, NamedResult>>({})
  const promptCache = useRef<Record<string, string>>({})

  // 첫 로드: 저장된 편집 · 설정 · 공유 링크
  useEffect(() => {
    setEdits(load<Record<string, string>>(LS_FILES, {}))
    const s = load<Settings>(LS_SETTINGS, DEFAULT_SETTINGS)
    setSettings(s)
    const cur = (() => {
      try {
        return localStorage.getItem(LS_CURRENT)
      } catch {
        return null
      }
    })()
    if (cur) setCurrentId(cur)
    const m = location.hash.match(/code=([\w-]+)/)
    if (m) {
      decodeShare(m[1])
        .then((txt) => {
          setShared(txt)
          setCurrentId(SHARED_ID)
          history.replaceState(null, '', location.pathname)
        })
        .catch(() => flash('공유 링크를 읽지 못했어요'))
    }
    try {
      if (!localStorage.getItem(LS_SETTINGS)) setShowSettings(true)
    } catch {
      /* 무시 */
    }
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const files: FileEntry[] = useMemo(() => {
    const list = builtins.map((f) => ({ ...f, content: edits[f.id] ?? f.content }))
    if (shared !== null) list.unshift({ id: SHARED_ID, title: '🔗 공유받은 파일', desc: '링크로 받은 내용', content: edits[SHARED_ID] ?? shared, builtin: false })
    return list
  }, [builtins, edits, shared])

  const current = files.find((f) => f.id === currentId) ?? files[0]
  const parsed = useMemo(() => parseHttpFile(current.content), [current.content])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  const onChange = useCallback(
    (v: string) => {
      setEdits((prev) => {
        const next = { ...prev, [current.id]: v }
        save(LS_FILES, next)
        return next
      })
    },
    [current.id],
  )

  const selectFile = (id: string) => {
    setCurrentId(id)
    try {
      localStorage.setItem(LS_CURRENT, id)
    } catch {
      /* 무시 */
    }
    setShowFiles(false)
  }

  const resetFile = () => {
    if (!current.builtin) return
    if (!confirm(`"${current.title}" 을(를) 처음 예제로 되돌릴까요? 고친 내용은 사라져요.`)) return
    setEdits((prev) => {
      const next = { ...prev }
      delete next[current.id]
      save(LS_FILES, next)
      return next
    })
  }

  const saveSettings = (s: Settings) => {
    setSettings(s)
    save(LS_SETTINGS, s)
    setShowSettings(false)
    flash('설정을 저장했어요 ✓')
  }

  const send = useCallback(
    async (line: number) => {
      const req: ParsedRequest | undefined = parsed.requests.find((r) => r.line === line)
      if (!req) return
      const title = req.title || req.name || `${req.method} ${req.url}`
      if (req.errors.length) {
        setResult({ kind: 'error', title, message: req.errors[0], warnings: [] })
        return
      }
      // 프롬프트 변수
      const prompts: Record<string, string> = {}
      for (const p of req.prompts) {
        const v = window.prompt(p.description || `${p.name} 값을 입력하세요`, promptCache.current[p.name] ?? '')
        if (v === null) return
        prompts[p.name] = v
        promptCache.current[p.name] = v
      }
      const envVars: Record<string, string> = {
        n8n: settings.n8n.replace(/\/+$/, ''),
        diary: settings.diary.replace(/\/+$/, ''),
        ...parseExtraVars(settings.extraVars),
      }
      const { sent, warnings } = buildRequest(req, { fileVars: parsed.fileVariables, envVars, named: named.current, prompts })
      if (!/^https?:\/\//i.test(sent.url)) {
        setResult({ kind: 'error', title, message: `주소가 올바르지 않아요: ${sent.url}`, hint: '변수 값이 비어 있는지 ⚙️ 설정을 확인해 보세요.', sent, warnings })
        return
      }
      setResult({ kind: 'loading', title, started: Date.now() })
      const mode = settings.mode
      try {
        const r = mode === 'server' ? await sendViaServer(sent, !req.noRedirect) : await sendDirect(sent, !req.noRedirect)
        if (req.name)
          named.current[req.name] = {
            request: sent,
            response: { status: r.status, statusText: r.statusText, headers: r.headers, body: r.body },
          }
        setResult({ kind: 'done', title, mode, sent, warnings, ...r })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (mode === 'direct' && e instanceof TypeError) {
          setResult({
            kind: 'error',
            title,
            sent,
            warnings,
            message: '브라우저가 요청을 막았어요 (CORS 일 가능성이 커요).',
            hint: '상대 서버가 브라우저 출입 허가(CORS)를 주지 않았어요. ⚙️ 설정 → 요청 방식을 "서버 경유" 로 바꾸면 해결돼요. (내 PC 의 localhost 주소라면 n8n 이 켜져 있는지 확인)',
          })
        } else setResult({ kind: 'error', title, sent, warnings, message: msg })
      }
    },
    [parsed, settings],
  )

  const share = async () => {
    try {
      const code = await encodeShare(current.content)
      const url = `${location.origin}${location.pathname}#code=${code}`
      await navigator.clipboard.writeText(url)
      flash('공유 링크를 복사했어요 — 붙여넣어 나눠 주세요')
    } catch {
      flash('링크를 만들지 못했어요')
    }
  }

  // Esc 로 창 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setShowSettings(false)
      setShowHelp(false)
      setShowFiles(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 가운데 경계 드래그
  const dragging = useRef(false)
  const mainRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current || !mainRef.current) return
      const r = mainRef.current.getBoundingClientRect()
      setSplit(Math.min(80, Math.max(20, ((e.clientX - r.left) / r.width) * 100)))
    }
    const up = () => (dragging.current = false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const hostLabel = (() => {
    try {
      return new URL(settings.n8n).host
    } catch {
      return '설정 필요'
    }
  })()
  const isInstructor = settings.n8n.replace(/\/+$/, '') === INSTRUCTOR.n8n

  if (!ready) return <div className="boot">불러오는 중…</div>

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn only-mobile" onClick={() => setShowFiles((v) => !v)} aria-label="파일 목록">
          ☰
        </button>
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <span>
            REST Client <b>Web</b>
          </span>
          <span className="brand-sub">VS Code REST Client 를 브라우저에서</span>
        </div>
        <span className="grow" />
        <button className="chip" onClick={() => setShowSettings(true)} title="내 n8n 주소 바꾸기">
          <span className="chip-k">n8n</span>
          <span className={`chip-v ${isInstructor ? 'inst' : 'mine'}`}>{isInstructor ? '강사 서버' : hostLabel}</span>
        </button>
        <button className="chip" onClick={() => setShowSettings(true)} title="요청 방식">
          {settings.mode === 'server' ? '🛰️ 서버 경유' : '🌐 브라우저 직접'}
        </button>
        <button className="btn" onClick={() => setShowHelp(true)}>
          📘 문법 도움말
        </button>
        <button className="btn" onClick={share}>
          🔗 공유
        </button>
        <button className="btn primary" onClick={() => setShowSettings(true)}>
          ⚙️ 설정
        </button>
      </header>

      <div className="body">
        <aside className={`sidebar ${showFiles ? 'open' : ''}`}>
          <div className="side-title">예제 파일</div>
          {files.map((f) => (
            <button key={f.id} className={`file ${f.id === current.id ? 'on' : ''}`} onClick={() => selectFile(f.id)}>
              <span className="file-title">{f.title}</span>
              <span className="file-desc">{f.desc}</span>
            </button>
          ))}
          <div className="side-title">이 파일의 요청 {parsed.requests.length}개</div>
          <div className="outline">
            {parsed.requests.map((r) => (
              <div key={r.index} className="outline-row">
                <button className="outline-item" onClick={() => setJump({ line: r.line, nonce: Date.now() })} title="편집기에서 보기">
                  <span className={`m m-${r.method.toLowerCase()}`}>{r.method}</span>
                  <span className="outline-text">{r.title || r.name || r.url}</span>
                </button>
                <button className="outline-send" onClick={() => send(r.line)} title="보내기">
                  ▶
                </button>
              </div>
            ))}
          </div>
          {current.builtin && (
            <button className="reset" onClick={resetFile}>
              ↺ 이 예제 처음으로
            </button>
          )}
        </aside>

        <main className="main" ref={mainRef} style={{ ['--split' as string]: `${split}%` }}>
          <section className="pane left">
            <div className="pane-head">
              <span className="tab-file">📄 {current.title}.http</span>
              <span className="grow" />
              <span className="muted small">▶ Send Request 또는 Ctrl/⌘ + Enter</span>
            </div>
            <HttpEditor value={current.content} onChange={onChange} onSend={send} fontSize={settings.fontSize} jumpTo={jump} key={current.id} />
          </section>
          <div className="divider" onPointerDown={() => (dragging.current = true)} />
          <section className="pane right">
            <div className="pane-head">
              <span className="tab-file">📨 Response</span>
            </div>
            <ResponseView result={result} fontSize={settings.fontSize} />
          </section>
        </main>
      </div>

      {showSettings && <SettingsDialog initial={settings} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
      {showHelp && (
        <HelpDrawer
          onClose={() => setShowHelp(false)}
          onOpenSyntax={() => {
            selectFile('syntax')
            setShowHelp(false)
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

type SendResult = {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  bodyEncoding: 'text' | 'base64'
  size: number
  elapsed: number
  truncated?: boolean
}

async function sendViaServer(s: SentRequest, follow: boolean): Promise<SendResult> {
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: s.method, url: s.url, headers: s.headers, body: s.body, followRedirects: follow }),
  })
  const data = await res.json().catch(() => null)
  if (!data) throw new Error(`서버 경유 요청이 실패했어요 (HTTP ${res.status})`)
  if (!data.ok) throw new Error(data.error)
  return data
}

async function sendDirect(s: SentRequest, follow: boolean): Promise<SendResult> {
  const started = performance.now()
  const res = await fetch(s.url, {
    method: s.method,
    headers: s.headers,
    body: ['GET', 'HEAD'].includes(s.method) ? undefined : s.body,
    redirect: follow ? 'follow' : 'manual',
  })
  const buf = await res.arrayBuffer()
  const headers: [string, string][] = []
  res.headers.forEach((v, k) => headers.push([k, v]))
  return {
    status: res.status,
    statusText: res.statusText,
    headers,
    body: new TextDecoder().decode(buf),
    bodyEncoding: 'text',
    size: buf.byteLength,
    elapsed: Math.round(performance.now() - started),
  }
}
