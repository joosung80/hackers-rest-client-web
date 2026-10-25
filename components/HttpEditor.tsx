'use client'

import { useEffect, useRef } from 'react'
import { EditorState, StateField, RangeSetBuilder, Compartment } from '@codemirror/state'
import {
  EditorView, Decoration, DecorationSet, WidgetType, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection, dropCursor,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'
import { parseHttpFile } from '@/lib/parser'

// ---------- .http 문법 색칠 ----------
type HState = { phase: 'pre' | 'headers' | 'body' }
const httpLanguage = StreamLanguage.define<HState>({
  name: 'http',
  startState: () => ({ phase: 'pre' }),
  token(stream, state) {
    if (stream.sol()) {
      if (stream.match(/^###.*/)) {
        state.phase = 'pre'
        return 'heading'
      }
      if (state.phase !== 'body') {
        if (stream.match(/^\s*(#|\/\/)\s*@[\w-]+.*/)) return 'meta'
        if (stream.match(/^\s*(#|\/\/).*/)) return 'comment'
        if (stream.match(/^@[A-Za-z_][\w.-]*(?=\s*=)/)) return 'definition'
      }
      if (state.phase === 'pre' && stream.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/i)) {
        state.phase = 'headers'
        return 'keyword'
      }
      if (state.phase === 'pre' && stream.match(/^curl\b/)) {
        state.phase = 'headers'
        return 'keyword'
      }
      if (state.phase === 'headers') {
        if (stream.match(/^\s*[?&][^=\s]+/)) return 'propertyName'
        if (stream.match(/^[^\s:{][^:]*?(?=\s*:)/)) return 'propertyName'
      }
    }
    if (stream.match(/\{\{[^}]*\}\}/)) return 'special'
    if (stream.match(/https?:\/\/[^\s{]+/)) return 'link'
    if (state.phase === 'body') {
      if (stream.match(/"(?:[^"\\]|\\.)*"(?=\s*:)/)) return 'propertyName'
      if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string'
      if (stream.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/)) return 'number'
      if (stream.match(/\b(true|false|null)\b/)) return 'atom'
    }
    if (stream.match(/HTTP\/[\d.]+/)) return 'meta'
    stream.next()
    return null
  },
  blankLine(state) {
    if (state.phase === 'headers') state.phase = 'body'
  },
  tokenTable: {
    heading: t.heading,
    meta: t.meta,
    comment: t.lineComment,
    definition: t.definition(t.variableName),
    keyword: t.keyword,
    propertyName: t.propertyName,
    special: t.special(t.variableName),
    link: t.link,
    string: t.string,
    number: t.number,
    atom: t.atom,
  },
})

const httpHighlight = HighlightStyle.define([
  { tag: t.heading, color: '#6a9955', fontWeight: '700' },
  { tag: t.lineComment, color: '#6a9955', fontStyle: 'italic' },
  { tag: t.meta, color: '#c586c0' },
  { tag: t.definition(t.variableName), color: '#9cdcfe', fontWeight: '700' },
  { tag: t.keyword, color: '#c586c0', fontWeight: '700' },
  { tag: t.propertyName, color: '#4fc1ff' },
  { tag: t.special(t.variableName), color: '#ffcb6b', background: 'rgba(255,203,107,.12)', borderRadius: '3px' },
  { tag: t.link, color: '#d7ba7d', textDecoration: 'underline' },
  { tag: t.string, color: '#ce9178' },
  { tag: t.number, color: '#b5cea8' },
  { tag: t.atom, color: '#569cd6' },
])

// ---------- "Send Request" 코드렌즈 ----------
class SendWidget extends WidgetType {
  constructor(readonly line: number, readonly label: string, readonly onSend: (line: number) => void) {
    super()
  }
  eq(o: SendWidget) {
    return o.line === this.line && o.label === this.label
  }
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-codelens'
    const a = document.createElement('button')
    a.type = 'button'
    a.className = 'cm-codelens-send'
    a.textContent = '▶ Send Request'
    a.onmousedown = (e) => {
      e.preventDefault()
      this.onSend(this.line)
    }
    wrap.appendChild(a)
    if (this.label) {
      const s = document.createElement('span')
      s.className = 'cm-codelens-label'
      s.textContent = this.label
      wrap.appendChild(s)
    }
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

function codelens(onSendRef: { current: (line: number) => void }) {
  const build = (state: EditorState): DecorationSet => {
    const parsed = parseHttpFile(state.doc.toString())
    const b = new RangeSetBuilder<Decoration>()
    for (const r of parsed.requests) {
      if (r.line + 1 > state.doc.lines) continue
      const line = state.doc.line(r.line + 1)
      const label = r.name ? `@name ${r.name}` : ''
      b.add(line.from, line.from, Decoration.widget({ widget: new SendWidget(r.line, label, (l) => onSendRef.current(l)), side: -1, block: true }))
    }
    return b.finish()
  }
  return StateField.define<DecorationSet>({
    create: build,
    update: (deco, tr) => (tr.docChanged ? build(tr.state) : deco),
    provide: (f) => EditorView.decorations.from(f),
  })
}

const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--ed-bg)', color: '#d4d4d4' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'var(--ed-bg)', color: '#6e7681', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#c6c6c6' },
    '.cm-cursor': { borderLeftColor: '#aeafad' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#264f78 !important' },
  },
  { dark: true },
)

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: (line: number) => void
  fontSize: number
  jumpTo?: { line: number; nonce: number }
}

export default function HttpEditor({ value, onChange, onSend, fontSize, jumpTo }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onSendRef = useRef(onSend)
  const onChangeRef = useRef(onChange)
  const fontComp = useRef(new Compartment())
  onSendRef.current = onSend
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const sendAtCursor = (v: EditorView) => {
      const line = v.state.doc.lineAt(v.state.selection.main.head).number - 1
      const parsed = parseHttpFile(v.state.doc.toString())
      const r = parsed.requests.find((x) => line >= x.startLine && line <= x.endLine)
      if (r) onSendRef.current(r.line)
      return true
    }
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        bracketMatching(),
        httpLanguage,
        syntaxHighlighting(httpHighlight),
        editorTheme,
        fontComp.current.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
        EditorView.lineWrapping,
        codelens(onSendRef),
        keymap.of([
          { key: 'Mod-Enter', run: sendAtCursor },
          { key: 'Ctrl-Alt-r', run: sendAtCursor },
          { key: 'Mod-Alt-r', run: sendAtCursor },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    view.current = new EditorView({ state, parent: host.current })
    return () => view.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 외부에서 문서가 바뀐 경우 (예제 전환 등)
  useEffect(() => {
    const v = view.current
    if (!v) return
    if (v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: fontComp.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })) })
  }, [fontSize])

  useEffect(() => {
    const v = view.current
    if (!v || !jumpTo) return
    const ln = Math.min(jumpTo.line + 1, v.state.doc.lines)
    const pos = v.state.doc.line(ln).from
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) })
    v.focus()
  }, [jumpTo])

  return <div ref={host} className="editor-host" />
}
