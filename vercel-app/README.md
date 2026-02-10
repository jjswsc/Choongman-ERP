# 충만치킨 ERP - Vercel 최소 예시

GAS에서 Vercel로 옮기기 위한 **로그인 관련 API 2개** 예시입니다.

## 필요한 것

- Node 18+
- Vercel 계정
- Supabase 프로젝트 (기존 ERP와 동일한 DB 사용 가능)

## 로컬에서 실행

```bash
cd vercel-app
npm install
npx vercel dev
```

브라우저에서 `http://localhost:3000` → `index.html`에서 getLoginData / loginCheck 버튼으로 API 테스트.

## 환경 변수

`.env.example`을 참고해 다음을 설정하세요.

- **로컬**: `vercel-app` 폴더에 `.env` 파일 생성 (또는 `vercel env pull`)
- **Vercel**: 프로젝트 설정 → Environment Variables 에 추가

| 이름 | 설명 |
|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL (https://xxxx.supabase.co) |
| `SUPABASE_ANON_KEY` | Supabase anon public key |

## 배포

```bash
cd vercel-app
npx vercel
```

또는 GitHub에 올린 뒤 Vercel 대시보드에서 저장소 연결 후 자동 배포.

## 기존 GAS 호출을 API로 바꾸는 방법

**GAS:**
```javascript
google.script.run.withSuccessHandler(function(data) {
  console.log(data);
}).getLoginData();
```

**Vercel (같은 동작):**
```javascript
fetch('/api/getLoginData')
  .then(r => r.json())
  .then(data => console.log(data));
```

**POST 예 (loginCheck):**
```javascript
fetch('/api/loginCheck', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ store: '매장명', name: '이름', pw: '비번', isAdminPage: false })
})
  .then(r => r.json())
  .then(data => console.log(data));
```

나머지 API도 `api/함수명.js` 로 추가하고, 기존 HTML/JS에서 `google.script.run` 대신 `fetch('/api/함수명', ...)` 로 바꾸면 됩니다.  
전체 계획은 프로젝트 루트의 **VERCEL_MIGRATION.md** 를 보세요.
