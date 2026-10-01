# Meta · TikTok ERP 연동 체크리스트 (도메인 기준)

운영 Origin은 [URLS-AND-DOMAINS.md](./URLS-AND-DOMAINS.md)와 같습니다. OAuth Redirect URI는 **프로젝트마다 본인 공식 도메인만** 등록합니다.

| 프로젝트 | 공식 Origin | Meta / TikTok Redirect URI |
|----------|-------------|----------------------------|
| **충만(내부)** | `https://choongman-erp.vercel.app` | `https://choongman-erp.vercel.app/api/meta/oauth/callback`<br>`https://choongman-erp.vercel.app/api/tiktok/oauth/callback` |
| **Omni(판매)** | `https://app.omnifoodtech.com` (또는 Primary로 쓰는 `www`) | `https://app.omnifoodtech.com/api/meta/oauth/callback`<br>`https://app.omnifoodtech.com/api/tiktok/oauth/callback` |
| **로컬** | `http://localhost:3000` | `http://localhost:3000/api/meta/oauth/callback`<br>`http://localhost:3000/api/tiktok/oauth/callback` |

서버는 `NEXT_PUBLIC_APP_URL`(끝 `/` 없음)이 있으면 그 값을 OAuth `redirect_uri`로 씁니다. **없으면** 요청 Origin을 씁니다. Vercel에는 위 표의 Origin과 동일하게 `NEXT_PUBLIC_APP_URL`을 넣는 것을 권장합니다.

---

## A. Meta (Facebook / Instagram) — 이미 구현됨

### A1. Meta Developer 앱

1. [developers.facebook.com](https://developers.facebook.com/) → Create App → **Business**
2. Product: **Facebook Login for Business** 추가
3. **Valid OAuth Redirect URIs**에 위 표의 Meta callback 등록 (프로젝트마다 해당 줄만)
4. App Review에서 Advanced Access 요청(운영·타 계정용):  
   `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights`, `ads_read`, `instagram_basic`, `instagram_manage_insights`
5. Development 모드면 앱 역할(테스터/개발자) 계정만 실데이터가 나옵니다.

### A2. Vercel 환경변수 (프로젝트별 Production)

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_APP_URL` | 권장 | 예: `https://choongman-erp.vercel.app` |
| `META_APP_ID` | ✅ | App ID |
| `META_APP_SECRET` | ✅ | App Secret |
| `META_TOKEN_ENCRYPTION_KEY` | ✅ | 긴 랜덤 문자열(토큰 DB 암호화). 한 번 정하면 바꾸면 기존 연결 해제 필요 |
| `META_AD_ACCOUNT_ID` | 선택 | `act_숫자` 또는 숫자. OAuth로 못 잡으면 폴백 |
| `META_PAGE_ID` | 선택 | 페이지가 여러 개일 때 기본 선택 |
| `META_ACCESS_TOKEN` | 선택 | OAuth 없이 env만으로 동기화할 때(비상용) |

### A3. Supabase SQL

[`sql/marketing_meta_connections.sql`](../sql/marketing_meta_connections.sql) 을 **해당 프로젝트 Supabase**에서 실행.

### A4. ERP에서 연결

1. 관리자 → 마케팅 → 연동 (`/admin/marketing/integrations`)
2. **Facebook 연결** → 페이지 여러 개면 선택
3. **데이터 동기화** → 광고·페이지 인사이트 확인

### A5. 직원 전달용 한 줄

> Meta 앱에 Redirect URI로 `https://choongman-erp.vercel.app/api/meta/oauth/callback` (충만) / Omni면 `https://app.omnifoodtech.com/api/meta/oauth/callback` 넣었는지, Vercel에 `META_APP_ID`·`META_APP_SECRET`·`META_TOKEN_ENCRYPTION_KEY`·`NEXT_PUBLIC_APP_URL` 넣었는지, SQL 실행했는지 확인한 뒤 ERP 연동 화면에서 Facebook 연결.

---

## B. TikTok Ads — ERP OAuth·동기화 구현됨

### B1. TikTok for Business 앱

1. [business-api.tiktok.com](https://business-api.tiktok.com/portal) → My Apps → 앱 생성/선택
2. **Advertiser redirect URL**에 위 표의 TikTok callback 등록
3. App ID / Secret 확보. 필요 시 Marketing API 권한·앱 심사

### B2. Vercel 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_APP_URL` | 권장 | Meta와 동일 Origin |
| `TIKTOK_APP_ID` | ✅ | App ID |
| `TIKTOK_APP_SECRET` | ✅ | Secret |
| `TIKTOK_TOKEN_ENCRYPTION_KEY` | 권장 | 없으면 `META_TOKEN_ENCRYPTION_KEY` 폴백 |
| `TIKTOK_ADVERTISER_ID` | 선택 | 광고주(Advertiser) ID. `TIKTOK_ADS_ACCOUNT_ID` 별칭도 동일 |
| `TIKTOK_ACCESS_TOKEN` | 선택 | OAuth 없이 env 폴백 |

### B3. Supabase SQL

[`sql/marketing_tiktok_connections.sql`](../sql/marketing_tiktok_connections.sql) 실행.

### B4. ERP에서 연결

1. 같은 연동 화면에서 **TikTok 연결**
2. Advertiser가 여러 개면 선택
3. **데이터 동기화** (방콕 기준 최근 28일 기본)

### B5. 직원 전달용 한 줄

> TikTok 앱 redirect에 `https://choongman-erp.vercel.app/api/tiktok/oauth/callback` (또는 Omni 도메인) 등록 → Vercel에 `TIKTOK_APP_ID`·`TIKTOK_APP_SECRET` → SQL 실행 → ERP에서 TikTok 연결·동기화.
