# Vercel 이전 가이드 (충만치킨 ERP)

---

## 📌 운영 원칙 (Vercel 위주 + GAS 동기화)

- **주 사용**: 모바일·API는 **Vercel**을 메인으로 사용합니다.
- **기능 업데이트**: Vercel에 좋은 기능을 추가/개선할 때, 같은 동작이 필요하면 **Apps Script(GAS)** 쪽도 함께 수정해 두는 것을 권장합니다.
  - 예: 공지 대상 부서(job) 변경, 시간표 "내 출퇴근 기록", 번역 키 추가 등 → Vercel 반영 후 GAS(Page.html, JS_Mobile_*, S_Office.js 등)에도 동일하게 반영.
- 이렇게 하면 나중에 GAS URL을 쓰는 경우에도 동일한 기능을 쓸 수 있습니다.

---

## 🚀 처음 배포하기 (GitHub·Vercel 비어 있을 때)

**지금 GitHub·Vercel에 아무 것도 없다면, 아래 순서대로만 하면 됩니다.**

### 1단계: GitHub에 코드 올리기

1. **GitHub 웹에서 저장소 만들기**
   - [github.com](https://github.com) 로그인 → 오른쪽 상단 **+** → **New repository**
   - Repository name: 예) `Choongman_ERP` (원하는 이름)
   - **Public** 선택 → **Create repository** 클릭
   - 생성 후 나오는 페이지은 그대로 두기 (다음 단계에서 사용)

2. **내 PC에서 이 프로젝트를 Git으로 연결하고 푸시**
   - **PowerShell** 또는 **명령 프롬프트**를 열고 아래를 **한 줄씩** 실행 (경로는 본인 폴더에 맞게 수정).  
   - 프로젝트 루트에 `.gitignore`가 있으면 `node_modules`는 자동으로 제외됩니다.

   ```bash
   cd c:\Choongman_ERP
   git init
   git add .
   git commit -m "Initial: ERP + vercel-app"
   git branch -M main
   git remote add origin https://github.com/본인아이디/저장소이름.git
   git push -u origin main
   ```

   - `본인아이디/저장소이름`은 1번에서 만든 저장소 주소로 바꾸기 (예: `myid/Choongman_ERP`).
   - GitHub 로그인을 묻으면 브라우저나 토큰으로 로그인.

3. **확인**
   - GitHub 저장소 페이지를 새로고침하면 `vercel-app`, `Page.html` 등 파일들이 보이면 성공.

---

### 2단계: Vercel에서 GitHub 연동 및 프로젝트 만들기

1. **Vercel 로그인**
   - [vercel.com](https://vercel.com) 접속 → 로그인 (GitHub로 로그인 권장).

2. **새 프로젝트 추가**
   - 대시보드에서 **Add New…** → **Project** 클릭.
   - **Import Git Repository**에서 방금 푸시한 **저장소 선택** (예: `Choongman_ERP`) → **Import** 클릭.

3. **프로젝트 설정 (중요)**
   - **Root Directory** 옆 **Edit** 클릭 → `vercel-app` 입력 후 **Continue**.
     - 이렇게 해야 Vercel이 `vercel-app` 폴더를 기준으로 빌드·배포합니다.
   - Framework Preset은 **Other** 그대로 두기.
   - **Deploy** 버튼 클릭.

4. **첫 배포**
   - 1~2분 정도 기다리면 배포 완료.
   - 이 시점에서는 **환경 변수를 안 넣었기 때문에** 로그인 등 API는 실패할 수 있습니다. 다음 단계에서 환경 변수를 넣으면 됩니다.

---

### 3단계: Vercel에 환경 변수 넣기

1. **Vercel 대시보드** → 방금 만든 **프로젝트** 클릭.
2. 상단 메뉴에서 **Settings** → 왼쪽에서 **Environment Variables** 클릭.
3. 아래 두 개 추가 (Supabase 대시보드에서 복사).

   | Name | Value | 비고 |
   |------|--------|------|
   | `SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 → Project Settings → API |
   | `SUPABASE_ANON_KEY` | anon public key | 같은 화면에서 복사 |

4. **Save** 한 뒤, **Deployments** 탭으로 가서 맨 위 배포 오른쪽 **⋯** → **Redeploy** 해서 다시 배포.
   - 환경 변수는 재배포 후에 적용됩니다.

---

### 4단계: 배포 결과 확인

- Vercel 프로젝트 페이지에서 **Visit** 또는 배포된 **도메인 주소**로 접속.
- **메인 주소/** → 테스트 페이지 + "모바일 앱" 링크.
- **메인 주소/app** → 로그인 화면. 매장·이름 선택 후 PIN 입력해서 로그인되면 정상입니다.

---

**정리:**  
**GitHub에 코드 푸시(1단계)** → **Vercel에서 해당 저장소 Import + Root Directory = `vercel-app`(2단계)** → **환경 변수 추가 후 Redeploy(3단계)** → **브라우저에서 /, /app 확인(4단계)**.

---

## 📋 배포 후 할 일 (순서대로 자세히)

**이미 "Vercel 이전 테스트" 화면이 보인다면**, 아래 순서대로만 하면 됩니다.

---

### ① Supabase에서 URL·Key 복사하기

1. 브라우저에서 **[app.supabase.com](https://app.supabase.com)** 접속 후 로그인.
2. 사용 중인 **프로젝트** 한 개 클릭.
3. 왼쪽 아래 **⚙️ Project Settings** 클릭.
4. 왼쪽 메뉴에서 **API** 클릭.
5. 화면에서 두 값을 복사해 둡니다.
   - **Project URL**  
     → 예: `https://abcdefghijk.supabase.co`  
     → 이 값을 **SUPABASE_URL** 로 씁니다.
   - **Project API keys** 안에 있는 **anon public** (긴 문자열)  
     → 이 값을 **SUPABASE_ANON_KEY** 로 씁니다.  
   - **key** 옆 눈 아이콘 눌러서 표시한 뒤 **복사** 하면 됩니다.

---

### ② Vercel에 환경 변수 넣기

1. **[vercel.com](https://vercel.com)** 접속 후 로그인.
2. 대시보드에서 **Choongman-ERP** (또는 만든 프로젝트 이름) 클릭.
3. 상단 탭에서 **Settings** 클릭.
4. 왼쪽 메뉴에서 **Environment Variables** 클릭.
5. **Key** 란에 `SUPABASE_URL` 입력, **Value** 란에 ①에서 복사한 Project URL 붙여넣기.
   - **Environment**는 **Production**, **Preview**, **Development** 전부 체크해 두거나, 최소 **Production**은 체크.
   - **Save** 클릭.
6. 다시 **Add New** (또는 **Add**) 클릭.
7. **Key** 에 `SUPABASE_ANON_KEY`, **Value** 에 ①에서 복사한 anon key 붙여넣기.
   - **Save** 클릭.

---

### ③ 환경 변수 적용을 위해 다시 배포하기

1. 같은 Vercel 프로젝트 안에서 상단 탭 **Deployments** 클릭.
2. 맨 위에 있는 배포(가장 최신) 한 줄에서 **오른쪽 ⋯(점 세 개)** 클릭.
3. **Redeploy** 클릭.
4. **Redeploy** 확인 버튼 다시 클릭.
5. 1~2분 정도 기다리면 상태가 **Ready** 로 바뀝니다.

---

### ④ 테스트 페이지에서 API 확인하기

1. 배포가 **Ready** 가 되면 **Visit** 버튼을 누르거나, 주소창에 배포된 URL 입력 (예: `https://choongman-erp-xxx.vercel.app`).
2. **"getLoginData 호출"** 버튼 클릭.
   - 아래에 `users`, `vendors` 가 들어 있는 객체가 보이면 **정상**입니다.
   - 에러 메시지나 `users: {}` 만 보이면 ②·③을 다시 확인하세요.
3. **"loginCheck 호출"** 버튼 클릭.
   - Supabase `employees` 테이블에 **매장명=테스트매장, 이름=테스트, 비밀번호=1234** 인 계정이 있으면 `success: true` 가 나옵니다.
   - 없으면 테스트용 계정을 Supabase에서 하나 만들거나, 실제 매장/이름/PIN으로 **모바일 앱**에서 로그인 테스트를 하면 됩니다.

---

### ⑤ 모바일 앱(/app)으로 로그인 테스트하기

1. 같은 페이지에서 **"모바일 앱 (로그인·공지·물류 연동)"** 링크 클릭  
   → 또는 주소 끝에 `/app` 을 붙여서 이동 (예: `https://xxx.vercel.app/app`).
2. **매장** 드롭다운에서 매장 선택.
3. **이름** 드롭다운에서 이름 선택.
4. **비밀번호(PIN)** 입력 후 **로그인** 버튼 클릭.
5. 로그인에 성공하면 홈 화면으로 넘어가고, **공지 조회**·**물류 데이터** 문구가 보이면 정상입니다.

---

### ⑥ (선택) 홈 상단 공지 문구 바꾸기

- Vercel **Settings** → **Environment Variables** 에서  
  **Key**: `SYSTEM_NOTICE`  
  **Value**: 원하는 공지 문구  
  를 추가한 뒤 **Redeploy** 하면, 메인/모바일 앱 상단 공지가 그 문구로 바뀝니다.

---

**한 줄 요약 순서:**  
**① Supabase에서 URL·anon key 복사** → **② Vercel Settings → Environment Variables 에 두 개 추가** → **③ Deployments → Redeploy** → **④ 테스트 페이지에서 getLoginData·loginCheck 버튼으로 확인** → **⑤ /app 에서 로그인 테스트**.

---

## 1. 현재 구조 요약

- **프론트**: HTML(Page.html, Logistics.html) + JS 조각(JS_*.html) → GAS가 `include()`로 합쳐서 서빙
- **백엔드**: Google Apps Script의 `google.script.run`으로 호출되는 함수들 (S_Common.js, S_HR.js, S_Office.js, S_Logistics.js, S_Store.js, S_Visit.js, S_Supabase.js)
- **DB**: Supabase (이미 사용 중) → **그대로 사용**
- **인증**: 매장/이름/비밀번호로 Supabase `employees` 테이블 조회 후 세션 유지

---

## 2. Vercel에서의 구조

| 구분 | GAS | Vercel |
|------|-----|--------|
| 페이지 서빙 | doGet → HtmlService (Page/Logistics) | 정적 HTML 또는 Next.js 등 |
| API | google.script.run → 각 function | `/api/*` Serverless Functions (Node.js) |
| DB | Supabase (UrlFetchApp) | Supabase (@supabase/supabase-js 또는 fetch) |
| 설정 | Script Properties | 환경 변수 (Vercel 대시보드) |

---

## 3. 이전 순서 (권장)

### 3단계 1: API 옮기기
1. **Supabase 클라이언트**  
   - Node용: `@supabase/supabase-js`  
   - 환경 변수: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (필요 시 `SUPABASE_SERVICE_ROLE_KEY`)
2. **서버 함수 → API 라우트**  
   - GAS의 각 `function xxx(...)`를 **API 하나씩**으로 매핑  
   - 예: `getLoginData()` → `GET /api/getLoginData`  
   - 예: `loginCheck(store, name, pw, isAdminPage)` → `POST /api/loginCheck` (body에 store, name, pw, isAdminPage)
3. **우선 옮길 API** (로그인/공통)  
   - ✅ `getLoginData`, ✅ `loginCheck`, ✅ `changePassword`, ✅ `getStoreListFromK`, ✅ `getNotice`, ✅ `getEmployeesData`, ✅ `getAppData` (완료)  
   - ⏳ `getDashboardSummary` (다른 API·스프레드시트 의존 — 나중에)  
   - ✅ `processOrder`, ✅ `processUsage` (주문·출고) 완료  
- ✅ `processOrderDecision` (주문 승인/보류/반려) 완료  
- ✅ 공지: `getMyNotices`, `logNoticeRead`, `adminSaveNotice`, `getNoticeHistoryAdmin` 완료  
- ✅ Logistics: `getAdminOrders`, `getInboundHistory`, `getOutboundHistory`, `updateOrderDeliveryDate` 완료  
- ✅ HR: `getAdminEmployeeList`, `getEmployeeNamesByStore`, `getSchedulesData`, `saveWeeklySmartSchedule`, `getLeaveAllData`, `requestLeave`, `getMyLeaveInfo`, `processLeaveDecision`, `getLeaveAllDataForMobile`, `processLeaveDecisionMobile`, `getAttendanceLogs`, `processAttendanceApproval`, `submitAttendance` 완료  
- ✅ Store: `getChecklistItems`, `saveCheckResult`, `deleteCheckHistory`, `getCheckHistory`, `updateChecklistItems`, `saveComplaintLog`, `updateComplaintLog`, `getComplaintLogList` 완료  
- ✅ Visit: `submitStoreVisit`, `getStoreVisitHistory`, `getStoreVisitStats`, `checkUserVisitStatus`, `getTodayMyVisits`  
- ✅ Office 추가: `adminGetNoticeStats`, `deleteNoticeAdmin`, `getNoticeOptions`, `getNoticeOptionsForMobile`, `getOfficeNamesByDept`, `getOfficeStaffList`, `getOfficeDepartments`, `getOfficeStaffListByDept`, `getWorkLogData`, `saveWorkLogData`, `submitDailyClose`, `updateManagerCheck`, `getAllFilterOptions`, `getManagerRangeReport`  
- ✅ Logistics 추가: `getCommonItemData`, `getItemCategories`, `getAdminItemsList`, `saveAdminItem`, `deleteAdminItem`, `getVendorManagementList`, `saveVendor`, `deleteVendor`, `getVendorNamesByType`, `getSalesVendorList`, `getInboundForStore`, `registerInboundBatch`  
- ✅ HR 추가: `saveAdminEmployee`, `deleteAdminEmployee`, `getTodayAttendanceTypes`  
- (선택) 나머지: `processOrderReceive`, `getMyOrderHistory`, `getMyUsageHistory`, `getMenuPermission`, `setMenuPermission`, `saveStoreSafetyStock`, `forceOutboundBatch`, `getScheduleForAdmin`, `updateScheduleRow`, `getSavedWeeklyData` 등 — 필요 시 동일 패턴으로 추가  
- 그다음: 프론트 연동 (google.script.run → fetch)

### 3단계 2: 프론트 수정
1. **호출 방식 통일**  
   - `google.script.run.withSuccessHandler(cb).functionName(a, b)`  
   - → `fetch('/api/functionName', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, b }) }).then(r => r.json()).then(cb)`
2. **공통 어댑터**  
   - 예: `window.api = (name, args) => fetch(\`/api/${name}\`, { method: 'POST', body: JSON.stringify(args || {}), headers: { 'Content-Type': 'application/json' } }).then(r => r.json());`  
   - 기존: `google.script.run.withSuccessHandler(cb).getLoginData()`  
   - 변경: `api('getLoginData', {}).then(cb)`
3. **페이지 서빙**  
   - 지금처럼 HTML 한 덩어리로 서빙하려면:  
     - Vercel에서 `public/`에 `index.html`, `admin.html` 두 개 넣고  
     - `vercel.json`에서 `/` → `index.html`, `/admin` → `admin.html`로 rewrites  
   - 또는 Next.js로 옮겨서 `pages/index.tsx`, `pages/admin.tsx`에서 기존 HTML/JS를 그대로 넣고, API는 `fetch('/api/...')`로 호출

### 3단계 3: 인증/세션
- GAS는 호출 시마다 매장/이름/비번을 넘기거나, 클라이언트에서 저장해 두고 사용  
- Vercel에서는 **로그인 성공 시 JWT 또는 세션 쿠키** 발급 후, 이후 API는 `Cookie` 또는 `Authorization` 헤더로 사용자 식별  
- Supabase Auth를 쓰지 않고, 지금처럼 `employees` 테이블로만 검증할 경우:  
  - 로그인 API에서 성공 시 **JWT**(store, name, role 담은 payload + 서버 비밀키 서명) 발급  
  - 다른 API에서는 이 JWT 검증 후 store/name/role 사용

---

## 4. 함수 개수 (참고)

- **S_Common.js**: doGet, getLoginData, getEmployeesData, loginCheck, changePassword, getAppData, getStoreListFromK, getNotice, getDashboardSummary 등
- **S_Office.js**: saveNotice, adminSaveNotice, getMyNotices, adminGetNoticeStats, deleteNoticeAdmin, getWorkLogData, saveWorkLogData 등
- **S_HR.js**: getAdminEmployeeList, getSchedulesData, saveWeeklySmartSchedule, calculatePayrollPreview, savePayrollToDB, submitAttendance, approveAttendance 등 (많음)
- **S_Logistics.js**: getAdminItemsList, getItems, processOrder, processUsage, getInboundHistory 등
- **S_Store.js**: getChecklistItems, saveCheckResult, saveComplaintLog 등
- **S_Visit.js**: submitStoreVisit, getStoreVisitHistory 등

→ **한 번에 전부 말고, 로그인·공지·출퇴근·스케줄 등 자주 쓰는 것부터 API로 옮기고, 프론트만 `fetch('/api/...')`로 바꾸는 방식**이 부담이 적음.

---

## 5. 환경 변수 (Vercel)

- `SUPABASE_URL`: Supabase 프로젝트 URL  
- `SUPABASE_ANON_KEY`: anon key (또는 service_role 필요 시 추가)  
- (선택) `JWT_SECRET`: 로그인 후 세션용 JWT 서명 키  

---

## 6. 참고: 제공된 예시

- `vercel-app/` 폴더에 **최소 예시**가 있습니다.  
  - `api/getLoginData.js`, `api/loginCheck.js`: Supabase 사용  
  - `lib/supabase.js`: Supabase 클라이언트  
  - `public/index.html`: `fetch('/api/getLoginData')`, `fetch('/api/loginCheck', ...)` 호출 예시  
- 로컬: `cd vercel-app && npm i && npx vercel dev`  
- 배포: `vercel` 또는 GitHub 연동 후 push로 배포  

이 예시를 기준으로 나머지 API와 기존 HTML을 조금씩 옮기면 됩니다.

---

## 7. 프론트 연동 진행 상황

### 완료
- **공통 API 어댑터**  
  - `vercel-app/public/api-adapter.js`: `window.runApi(method, apiName, body)` → `fetch('/api/' + apiName, ...)` 호출 후 JSON 반환.
- **모바일 공통 스크립트 (JS_Mobile_Common.html)**  
  - `runApi`가 정의되어 있으면 `runApi` 사용, 없으면 기존 `google.script.run` 유지.  
  - 연동된 API: `getNotice`, `getLoginData`, `loginCheck`, `getMyNotices`, `logNoticeRead`, `getAppData`, `getNoticeOptionsForMobile`, `adminSaveNotice`, `getLeaveAllDataForMobile`, `processLeaveDecisionMobile`.  
  - 공지 번역(`translateBatch`)은 Vercel 모드에서 생략·원문 표시.
- **Vercel 진입점**  
  - `vercel-app/public/app.html`: 로그인·홈 공지·물류(getAppData) 연동된 최소 모바일 화면.  
  - `vercel-app/public/index.html`: 테스트 버튼 + **모바일 앱** 링크 (`/app`).  
  - `vercel.json`: `/app` → `/app.html`, `public/**` 정적 빌드 추가.

### 다음에 할 일
- GAS에서 모바일 페이지를 열 때 `api-adapter.js`를 **로드하지 않으면** 기존대로 `google.script.run` 사용.  
- Vercel에서 전체 모바일 앱(주문·사용·HR·방문·Admin 전체)을 쓰려면:  
  - `Page.html` + 포함 스크립트를 정적 파일로 복사하거나,  
  - `app.html`처럼 `runApi`만 쓰는 최소 페이지만 쓰고 나머지는 GAS에서 계속 사용.
- 모바일 근태 승인: `getAttendancePendingForMobile`, `processAttendanceApprovalMobile`은 Vercel API에 없음. 필요 시 동일 패턴으로 API 추가 후 `JS_Mobile_Common.html`에 `runApi` 분기 추가.

### Hobby 플랜 12개 함수 제한 대응
- Vercel **Hobby 플랜**은 배포당 **서버리스 함수 최대 12개**만 허용합니다.
- API가 70개 이상이므로, **단일 진입점**으로 묶었습니다.
  - `vercel-app/api/[[...slug]].js`: `/api/getLoginData`, `/api/loginCheck` 등 **모든** `/api/*` 요청을 받아 해당 폴더의 `index.js`로 넘깁니다.
  - `vercel.json`의 API 빌드는 **이 파일 하나만** 빌드하도록 설정 (`api/[[...slug]].js`).  
  → 배포되는 서버리스 함수는 **1개**만 생기므로 Hobby 제한을 통과합니다.
- Node 버전 경고를 줄이기 위해 `package.json`의 `engines.node`를 `18.x`로 고정해 두었습니다.
