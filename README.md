# ⚡ REST Client Web

VS Code 확장 **REST Client**(`.http` 파일) 문법을 **브라우저에서 바로** 쓰는 웹 버전입니다.
해커스 n8n 업무자동화 특강(2026-10-26) 실습용으로 만들었습니다.

**👉 https://hackers-rest-client.vercel.app**

## 특징
- **VS Code 와 같은 사용감** — 요청 위 `▶ Send Request`, `Ctrl/⌘ + Enter`, 응답은 `HTTP/1.1 200 OK` + 헤더 + 본문
- **CORS 걱정 없음** — 기본 "서버 경유" 모드: 브라우저 대신 서버(Vercel, 서울 리전)가 요청을 보냄
- **내 n8n 주소는 ⚙️ 설정에서 한 번만** → 예제의 `{{n8n}}` · `{{diary}}` 에 자동 적용 (브라우저에 저장)
- **강의 예제 내장** — 기초 CRUD · 1교시 웹훅 · 2교시 다이어리 · 3교시 RSS · 문법 총정리
- **공유 링크** — 지금 파일을 링크 하나로 나눠 주기

## 지원 문법
`###` 요청 구분 · `#`/`//` 주석 · `METHOD URL HTTP/1.1` · 여러 줄 쿼리(`?`/`&`) · 헤더 · 본문 ·
파일 변수 `@x = y` · 설정/추가 변수 · 시스템 변수 `{{$guid}}` `{{$randomInt a b}}` `{{$timestamp}}` `{{$datetime …}}` `{{$localDatetime …}}` ·
요청 이름 `# @name` + 응답 꺼내기 `{{name.response.body.$.x}}` `{{name.response.headers.X}}` ·
프롬프트 `# @prompt` · `# @no-redirect` · form-urlencoded · multipart(텍스트) · Basic 인증 자동 Base64 · GraphQL(`X-REQUEST-TYPE: GraphQL`) · cURL 붙여넣기

미지원: 파일 첨부(`< ./file`), `$dotenv`, `$processEnv`, 쿠키 저장소

## 서버 경유 모드의 안전장치
- 내 PC·사내망·클라우드 메타데이터 주소 차단 (→ 이런 주소는 "브라우저 직접" 모드 사용)
- 요청 1MB · 응답 5MB · 20초 제한, IP 당 분당 600회

## 실행
```bash
npm install
npm run dev   # http://localhost:3000
```
