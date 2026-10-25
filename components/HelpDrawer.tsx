'use client'

const ROWS: [string, string, string][] = [
  ['요청 나누기', '### 설명', '### 위아래로 요청을 나눠요. 뒤의 글은 제목이 돼요'],
  ['주석', '# 메모  또는  // 메모', '요청 앞의 # 줄은 무시돼요'],
  ['기본 요청', 'GET https://site.com/path', '방식 + 주소. 방식을 빼면 GET'],
  ['헤더', 'Content-Type: application/json', '요청 줄 바로 아래, 이름: 값'],
  ['본문', '(빈 줄) 다음에 JSON', '헤더 다음 빈 줄 한 줄 뒤부터가 본문'],
  ['쿼리', '?a=1\n&b=2', '주소 아래 줄에 ? / & 로 이어 쓰기'],
  ['파일 변수', '@base = https://site.com', '{{base}} 로 사용'],
  ['설정 변수', '{{n8n}}  {{diary}}', '⚙️ 설정의 내 주소 · 추가 변수'],
  ['시스템 변수', '{{$guid}}  {{$randomInt 1 100}}', '매번 새로운 값'],
  ['시간', '{{$timestamp}}  {{$datetime iso8601}}', "{{$localDatetime 'YYYY-MM-DD'}} · -1 d 처럼 더하기/빼기"],
  ['요청 이름', '# @name login', '요청에 이름 붙이기'],
  ['응답 꺼내기', '{{login.response.body.$.token}}', '이름 붙인 요청의 응답 값 (JSONPath)'],
  ['응답 헤더', '{{login.response.headers.Location}}', '헤더 값 꺼내기'],
  ['물어보기', '# @prompt city 도시 이름', '보낼 때 값을 물어봐요 → {{city}}'],
  ['폼 전송', 'Content-Type: application/x-www-form-urlencoded', 'a=1\n&b=2 처럼 여러 줄'],
  ['Basic 인증', 'Authorization: Basic 아이디:비번', '자동으로 Base64 변환'],
  ['GraphQL', 'X-REQUEST-TYPE: GraphQL', '쿼리 (빈 줄) 변수 JSON'],
  ['cURL', 'curl -X POST https://… -d "…"', '그대로 붙여넣어도 돼요'],
  ['리다이렉트 끄기', '# @no-redirect', '3xx 를 따라가지 않음'],
]

export default function HelpDrawer({ onClose, onOpenSyntax }: { onClose: () => void; onOpenSyntax: () => void }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label="문법 도움말">
        <div className="modal-head">
          <h2>📘 REST Client 문법 한눈에</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <pre className="anatomy">{`### 1) 요청 이름(설명)
POST {{n8n}}/webhook/hackers-words    ← ① 방식 + ② 주소
Content-Type: application/json        ← ③ 헤더 (이름: 값)
                                      ← ④ 빈 줄 = 머리말 끝!
{ "words": ["고양이", "커피", "회의"] }   ← ⑤ 본문(JSON)`}</pre>
          <button className="btn primary wide" onClick={onOpenSyntax}>
            📚 문법 총정리 예제 열기 (위에서부터 하나씩 Send)
          </button>
          <table className="cheat">
            <tbody>
              {ROWS.map(([k, code, d]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>
                    <code>{code}</code>
                    <div className="d">{d}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>🛰️ 서버 경유 vs 🌐 브라우저 직접</h3>
          <p>
            브라우저에서 다른 사이트를 부르면 상대가 <b>CORS(브라우저 출입 허가)</b>를 줘야 해요. 그래서 이 사이트는 기본으로 <b>서버가 대신 보내는 방식</b>을 써요 → RSS, 남의 API, Vercel 사이트 무엇이든 OK.
          </p>
          <p>
            단, 서버는 <b>내 PC(localhost) · 사내망</b>에는 들어갈 수 없어요. 그럴 땐 ⚙️ 설정에서 <b>브라우저 직접</b>으로 바꾸세요.
          </p>
          <h3>⌨️ 단축키</h3>
          <p>
            요청 안에 커서 → <code>Ctrl/⌘ + Enter</code> (또는 VS Code 와 같은 <code>Ctrl + Alt + R</code>) · 찾기 <code>Ctrl/⌘ + F</code>
          </p>
          <p className="muted small">VS Code 확장 REST Client(humao.rest-client) 문법을 따릅니다. 파일 첨부(&lt; ./file), $dotenv/$processEnv 는 웹에서 지원하지 않아요.</p>
        </div>
      </aside>
    </div>
  )
}
