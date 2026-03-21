# KBank 연동 — 은행 회신 전에 할 일 (체크리스트)

은행 답변을 기다리는 동안 **코드 반영 → 배포 → URL 동작 확인**까지 마치면 됩니다.

---

## 1. Git 반영 후 배포

**저장소 루트**에서 실행해야 합니다. 이 프로젝트는 `vercel-app`이 **홈 폴더가 아니라** 클론한 경로 아래에 있습니다.

- Windows 예: `C:\CM_ERP\vercel-app` (먼저 `cd C:\CM_ERP` 후 `cd vercel-app`, 또는 한 번에 `cd C:\CM_ERP\vercel-app`)
- `C:\Users\…`에서 `cd vercel-app`만 하면 **경로가 없다**는 오류가 납니다.

**옵션 A — Git은 저장소 루트(`C:\CM_ERP`)에서** (경로에 `vercel-app/` 접두사):

```powershell
cd C:\CM_ERP
git add vercel-app/app/api/webhooks/kbank vercel-app/app/payment/return vercel-app/app/pos/payment/return vercel-app/docs/KBANK-FIXED-IP-PROXY.md vercel-app/docs/KBANK-PRE-BANK-CHECKLIST.md
git commit -m "feat(kbank): webhook stubs, switchback pages, proxy docs"
git push
```

**Git 루트**는 `vercel-app` 안이 아니라 **`C:\CM_ERP`** 한 단계 위입니다. `npm run build` 등만 `C:\CM_ERP\vercel-app`에서 하면 됩니다.

- Vercel이 Git 연동이면 **푸시 후 자동 배포**됩니다.  
- 수동 배포면 [Vercel Dashboard](https://vercel.com) → 프로젝트 → **Deployments → Redeploy** 또는 로컬에서 `vercel` CLI(로그인된 환경)로 배포합니다.

---

## 2. 배포 후 URL 확인 (PowerShell)

**이미 Vercel에 배포까지 끝났다면** §1(Git 푸시·배포)은 생략하고, 아래 `curl`만으로 동작 확인하면 됩니다.

**베이스 URL**을 본인 프로덕션 주소로 바꿉니다. (예: `https://choongman-erp.vercel.app`)

### 웹훅 스텁 (200 + JSON)

```powershell
$base = "https://choongman-erp.vercel.app"
curl.exe -sS -w "`nHTTP %{http_code}`n" "$base/api/webhooks/kbank/onboarding"
curl.exe -sS -X POST -w "`nHTTP %{http_code}`n" "$base/api/webhooks/kbank/payment/card"
```

기대: 본문에 `"stub":true` 포함, HTTP **200**.

### 스위치백 페이지 (200 HTML)

```powershell
curl.exe -sS -o NUL -w "payment/return HTTP %{http_code}`n" "$base/payment/return"
curl.exe -sS -o NUL -w "pos/payment/return HTTP %{http_code}`n" "$base/pos/payment/return"
```

기대: HTTP **200**.

### 앱·DB 상태 (선택)

```powershell
curl.exe -sS "$base/api/health"
```

---

## 3. 나중에 넣을 환경 변수 (아직 필수 아님)

KBank **서버→은행 API** 호출 코드를 붙일 때 Vercel에 설정:

| 변수 | 예시 |
|------|------|
| `KBANK_OPENAPI_BASE_URL` | `https://kbank-proxy.omnifoodtech.com` |
| `KBANK_PROXY_SECRET` | Nginx `map`과 동일한 hex (비밀) |

지금 웹훅 스텁은 위 변수 **없이** 동작합니다.

---

## 4. 관련 문서

- 인프라·프록시: [KBANK-FIXED-IP-PROXY.md](./KBANK-FIXED-IP-PROXY.md)

---

## 5. 은행 측과 병행

- 온보딩 폼 제출·보완 요청 대기  
- 회신 오면 **운영 API 호스트·웹훅 서명 규격**에 맞춰 `app/api/webhooks/kbank/[...path]/route.ts` 확장  

이 체크리스트까지 끝나면 **“지금 해도 되는 것”** 은 일단락입니다.
