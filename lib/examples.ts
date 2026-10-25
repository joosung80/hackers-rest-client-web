// 기본 탑재 예제 파일들
export type ExampleFile = { id: string; title: string; desc: string; content: string }

export const EXAMPLES: ExampleFile[] = [
  {
    id: 'start',
    title: '👋 시작하기 · 기초 CRUD',
    desc: 'GET · POST · PUT · PATCH · DELETE 와 쿼리 파라미터',
    content: `### 1) 가장 간단한 GET — 글 1번 가져오기
# 위의 "Send Request" 를 누르거나, 커서를 두고 Ctrl/Cmd + Enter
GET https://jsonplaceholder.typicode.com/posts/1

### 2) 쿼리 파라미터 — 주소 뒤 ?키=값&키=값
GET https://jsonplaceholder.typicode.com/comments?postId=1&_limit=3

### 3) 쿼리를 여러 줄로 나눠 쓰기 (? 와 & 로 시작하는 줄)
GET https://jsonplaceholder.typicode.com/posts
    ?userId=1
    &_limit=2

### 4) POST — JSON 주문서 보내기 (헤더 다음 빈 줄 → 본문)
POST https://jsonplaceholder.typicode.com/posts
Content-Type: application/json

{
  "title": "오늘의 일기",
  "body": "REST Client 웹 버전으로 보냈어요",
  "userId": 1
}

### 5) PUT — 통째로 바꾸기
PUT https://jsonplaceholder.typicode.com/posts/1
Content-Type: application/json

{ "id": 1, "title": "수정된 제목", "body": "수정된 내용", "userId": 1 }

### 6) PATCH — 일부만 바꾸기
PATCH https://jsonplaceholder.typicode.com/posts/1
Content-Type: application/json

{ "title": "제목만 바꿔요" }

### 7) DELETE — 지우기
DELETE https://jsonplaceholder.typicode.com/posts/1
`,
  },
  {
    id: 'lecture1',
    title: '1교시 · n8n Webhook (초인종)',
    desc: '테스트 URL · 운영 URL · 404 체험',
    content: `# 1교시 — n8n 웹훅에 JSON 주문서 보내기
# {{n8n}} 은 오른쪽 위 ⚙️ 설정의 "내 n8n 주소" 로 바뀌어요 (처음엔 강사 서버)

### 1-1 테스트 URL — n8n 에서 "Listen for test event" 를 먼저 누르세요!
POST {{n8n}}/webhook-test/hackers-words
Content-Type: application/json

{ "words": ["고양이", "커피", "회의"] }

### 1-2 운영 URL — 워크플로우가 Publish(활성화) 상태면 언제나 OK
POST {{n8n}}/webhook/hackers-words
Content-Type: application/json

{ "words": ["고양이", "커피", "회의"] }

### 1-3 GET + 쿼리로 보내보기 → 404 (이 창구는 POST 전용)
GET {{n8n}}/webhook/hackers-words?word=고양이&count=1
`,
  },
  {
    id: 'lecture2',
    title: '2교시 · 웹 다이어리',
    desc: 'n8n 직접 호출 · Next.js API Route(안내데스크) 호출',
    content: `# 2교시 — 다이어리 웹훅과 안내데스크(API Route)
# {{n8n}} · {{diary}} 는 오른쪽 위 ⚙️ 설정에서 내 주소로 바꿀 수 있어요

### 2-1 n8n 다이어리 웹훅 직접 호출 → 응답 노드의 답장 "저장 완료"
POST {{n8n}}/webhook/hackers-diary
Content-Type: application/json

{
  "title": "오늘의 일기",
  "content": "REST Client 웹으로 n8n 에 바로 보내 봤다."
}

### 2-2 안내데스크 /api/diary 호출 (브라우저 도구라면 CORS 로 막히지만 여기선 "서버 경유"라 OK)
POST {{diary}}/api/diary
Content-Type: application/json

{
  "title": "안내데스크 경유",
  "content": "Vercel API Route 를 거쳐 n8n 으로!"
}

### 2-3 빈 값을 보내면? → 안내데스크가 400 으로 돌려보냄
POST {{diary}}/api/diary
Content-Type: application/json

{ "title": "", "content": "" }
`,
  },
  {
    id: 'lecture3',
    title: '3교시 · RSS · 검색 API',
    desc: 'RSS 원본(XML) · GET 쿼리 파라미터로 5개만',
    content: `# 3교시 — 신문 구독(RSS)과 검색 API

### 3-1 Hacker News RSS 원본 보기 (XML) — 서버 경유라 CORS 걱정 없음
GET https://news.ycombinator.com/rss

### 3-2 HN 검색 API — 쿼리 파라미터로 n8n 기사 5개만 (API 쪽 Limit!)
GET https://hn.algolia.com/api/v1/search
    ?query=n8n
    &tags=story
    &hitsPerPage=5

### 3-3 내 관심사로 바꿔 보기 — query 값만 고치면 끝
GET https://hn.algolia.com/api/v1/search?query=shipbuilding&tags=story&hitsPerPage=5
`,
  },
  {
    id: 'syntax',
    title: '📚 문법 총정리 (REST Client)',
    desc: '변수 · 시스템 변수 · 요청 연결 · form · multipart · 인증 · GraphQL · cURL',
    content: `# ─────────────────────────────────────────────
#  REST Client 문법 총정리 — 위에서부터 하나씩 Send!
# ─────────────────────────────────────────────

# ① 파일 변수: @이름 = 값  →  {{이름}} 으로 사용
@base = https://httpbin.org
@user = hackers

### ② 변수 + 헤더 여러 개
GET {{base}}/get?who={{user}}
Accept: application/json
X-Lecture: n8n-special

### ③ 시스템 변수 — 매번 새 값이 들어가요
POST {{base}}/post
Content-Type: application/json

{
  "id": "{{$guid}}",
  "lucky": {{$randomInt 1 100}},
  "unix": {{$timestamp}},
  "utc": "{{$datetime iso8601}}",
  "seoul": "{{$localDatetime 'YYYY-MM-DD HH:mm:ss'}}",
  "yesterday": "{{$datetime iso8601 -1 d}}"
}

### ④ 요청 이름 붙이기 → 다음 요청에서 응답값 꺼내 쓰기 (요청 연결)
# @name newPost
POST https://jsonplaceholder.typicode.com/posts
Content-Type: application/json

{ "title": "연결 테스트", "userId": 7 }

### ⑤ 위 응답의 id / 헤더를 그대로 사용 (④ 를 먼저 보내세요)
GET https://jsonplaceholder.typicode.com/users/{{newPost.response.body.$.userId}}
X-Created-Id: {{newPost.response.body.$.id}}
X-Prev-Type: {{newPost.response.headers.Content-Type}}

### ⑥ 폼 전송 (x-www-form-urlencoded) — 여러 줄은 & 로 이어 쓰기
POST {{base}}/post
Content-Type: application/x-www-form-urlencoded

name=홍길동
&team=조선해양
&score=95

### ⑦ multipart/form-data (텍스트 필드)
POST {{base}}/post
Content-Type: multipart/form-data; boundary=WebBoundary

--WebBoundary
Content-Disposition: form-data; name="title"

보고서
--WebBoundary
Content-Disposition: form-data; name="memo"

웹 버전은 텍스트 필드만 지원해요
--WebBoundary--

### ⑧ Basic 인증 — "아이디:비번" 을 적으면 자동으로 Base64 로 바꿔 보내요
GET {{base}}/basic-auth/hackers/n8n
Authorization: Basic hackers:n8n

### ⑨ Bearer 토큰
GET {{base}}/bearer
Authorization: Bearer my-secret-token

### ⑩ GraphQL — X-REQUEST-TYPE: GraphQL 헤더 + 쿼리 + (빈 줄) + 변수
POST https://countries.trevorblades.com/
Content-Type: application/json
X-REQUEST-TYPE: GraphQL

query ($code: ID!) {
  country(code: $code) { name capital currency emoji }
}

{ "code": "KR" }

### ⑪ cURL 을 그대로 붙여넣어도 돼요
curl -X POST https://httpbin.org/anything \\
  -H "Content-Type: application/json" \\
  -d '{"from":"curl"}'

### ⑫ 실행할 때 값을 물어보기 (프롬프트 변수)
# @prompt city 궁금한 도시 이름 (영문)
GET https://geocoding-api.open-meteo.com/v1/search?name={{city}}&count=1&language=ko

### ⑬ 리다이렉트 따라가지 않기
# @no-redirect
GET {{base}}/redirect-to?url=https://example.com&status_code=302

### ⑭ 상태코드 영수증 체험 — 숫자만 바꿔 보세요 (200 · 404 · 500 …)
GET {{base}}/status/404

### ⑮ 설정 변수 — ⚙️ 설정의 "내 주소" 와 "추가 변수" 가 {{이름}} 으로 들어가요
GET {{base}}/anything?n8n={{n8n}}&msg={{greeting}}
`,
  },
]

export const INSTRUCTOR = {
  n8n: 'https://n8n.elanvitaloffice.com',
  diary: 'https://hackers-diary-web.vercel.app',
}

export const DEFAULT_EXTRA_VARS = `# 이름 = 값 (한 줄에 하나) → {{이름}} 으로 사용
greeting = 안녕하세요
`
