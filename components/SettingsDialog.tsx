'use client'

import { useState } from 'react'
import { INSTRUCTOR, DEFAULT_EXTRA_VARS } from '@/lib/examples'

export type Settings = {
  n8n: string
  diary: string
  mode: 'auto' | 'server' | 'direct'
  extraVars: string
  fontSize: number
}

export const DEFAULT_SETTINGS: Settings = {
  n8n: INSTRUCTOR.n8n,
  diary: INSTRUCTOR.diary,
  mode: 'auto',
  extraVars: DEFAULT_EXTRA_VARS,
  fontSize: 15,
}

export function parseExtraVars(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('//')) continue
    const m = t.match(/^@?([A-Za-z_][\w.-]*)\s*[=:]\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function cleanUrl(u: string) {
  return u.trim().replace(/\/+$/, '').replace(/\/webhook(-test)?(\/.*)?$/, '')
}

function validUrl(u: string) {
  try {
    const x = new URL(u)
    return x.protocol === 'http:' || x.protocol === 'https:'
  } catch {
    return false
  }
}

export default function SettingsDialog({ initial, onSave, onClose }: { initial: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [s, setS] = useState<Settings>(initial)
  const n8n = cleanUrl(s.n8n)
  const diary = cleanUrl(s.diary)
  const n8nOk = validUrl(n8n)
  const diaryOk = !s.diary.trim() || validUrl(diary)
  const local = /localhost|127\.0\.0\.1|192\.168\.|^https?:\/\/10\./.test(n8n)

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="설정">
        <div className="modal-head">
          <h2>⚙️ 설정</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <section>
            <h3>① 내 주소 — 예제의 {'{{n8n}}'} · {'{{diary}}'} 에 들어가요</h3>
            <label className="field">
              <span>내 n8n 주소</span>
              <input
                value={s.n8n}
                onChange={(e) => setS({ ...s, n8n: e.target.value })}
                placeholder="https://내이름.app.n8n.cloud"
                spellCheck={false}
                autoFocus
              />
            </label>
            <div className="preview">
              {n8nOk ? (
                <>
                  미리보기 → <code>{n8n}/webhook-test/hackers-words</code>
                </>
              ) : (
                <span className="bad">https:// 로 시작하는 주소를 넣어 주세요 (n8n 화면 주소창의 앞부분)</span>
              )}
            </div>
            {local && (
              <div className="note">
                💡 내 PC n8n 이네요! 요청 방식 <b>자동</b> 이면 알아서 브라우저 직접으로 보내요. 처음 보낼 때 Chrome 주소창에 <b>「로컬 네트워크 기기 액세스」 확인 창</b>이 뜨면 <b>허용</b>을 눌러 주세요.
              </div>
            )}
            <div className="row-btns">
              <button className="btn small" onClick={() => setS({ ...s, n8n: INSTRUCTOR.n8n, diary: INSTRUCTOR.diary })}>
                강사 서버로 되돌리기
              </button>
            </div>
            <p className="help">
              찾는 법: n8n 화면 주소창이 <code>https://abc.app.n8n.cloud/workflow/…</code> 라면 <code>https://abc.app.n8n.cloud</code> 까지만. 웹훅 주소를 통째로 붙여넣어도 앞부분만 남겨 드려요.
            </p>

            <label className="field">
              <span>내 다이어리 주소 (2교시 · 선택)</span>
              <input value={s.diary} onChange={(e) => setS({ ...s, diary: e.target.value })} placeholder="https://내-다이어리.vercel.app" spellCheck={false} />
            </label>
            {!diaryOk && <div className="preview bad">https:// 로 시작하는 주소를 넣어 주세요</div>}
          </section>

          <section>
            <h3>② 요청 방식</h3>
            <label className={`radio ${s.mode === 'auto' ? 'on' : ''}`}>
              <input type="radio" checked={s.mode === 'auto'} onChange={() => setS({ ...s, mode: 'auto' })} />
              <div>
                <b>✨ 자동 (추천 · 셀프 호스팅 지원)</b>
                <p>
                  주소를 보고 알아서 골라요 — 인터넷 주소(n8n Cloud 등)는 <b>서버 경유</b>, 내 PC(<code>localhost</code>)·사내망 n8n 은 <b>브라우저 직접</b>.
                </p>
              </div>
            </label>
            <label className={`radio ${s.mode === 'server' ? 'on' : ''}`}>
              <input type="radio" checked={s.mode === 'server'} onChange={() => setS({ ...s, mode: 'server' })} />
              <div>
                <b>🛰️ 항상 서버 경유</b>
                <p>이 사이트의 서버가 대신 보내요 → <b>CORS 걱정 없음</b>. 인터넷에 공개된 주소면 다 돼요.</p>
              </div>
            </label>
            <label className={`radio ${s.mode === 'direct' ? 'on' : ''}`}>
              <input type="radio" checked={s.mode === 'direct'} onChange={() => setS({ ...s, mode: 'direct' })} />
              <div>
                <b>🌐 항상 브라우저 직접</b>
                <p>내 브라우저가 바로 보내요. 내 PC(localhost)·사내망 주소용. 상대가 CORS 를 허락해야 해요.</p>
              </div>
            </label>
          </section>

          <section>
            <h3>③ 추가 변수 (선택)</h3>
            <textarea value={s.extraVars} onChange={(e) => setS({ ...s, extraVars: e.target.value })} rows={4} spellCheck={false} />
            <p className="help">
              <code>이름 = 값</code> 한 줄에 하나 → 어느 파일에서든 <code>{'{{이름}}'}</code> 으로 써요. (파일 안의 <code>@이름 = 값</code> 이 있으면 그게 우선)
            </p>
          </section>

          <section>
            <h3>④ 글자 크기 — {s.fontSize}px</h3>
            <input type="range" min={12} max={24} value={s.fontSize} onChange={(e) => setS({ ...s, fontSize: Number(e.target.value) })} />
          </section>
        </div>

        <div className="modal-foot">
          <span className="muted small">설정은 이 브라우저에만 저장돼요</span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={!n8nOk || !diaryOk}
            onClick={() => onSave({ ...s, n8n, diary: s.diary.trim() ? diary : '' })}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
