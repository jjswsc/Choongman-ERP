# URL·도메인 운영 메모 (내부 vs 판매)

레포·문서·랜딩에 등장하는 주소를 **역할별로 한 장**에 묶었습니다. Vercel에서 실제로 연결된 프로젝트·별칭은 **대시보드 `Settings → Domains`** 기준이 최종입니다.

---

## 공식 한 줄

| 구분 | 공식 베이스 | 비고 |
|------|-------------|------|
| **내부(충만) 실운영** | `https://choongman-erp.vercel.app` | Windows POS/ERP manifest, 샘플 설정, KB·웹훅 예시가 이 호스트를 가리킴 |
| **판매(OmniFoodTech) 웹앱** | 문서상 Primary: `https://www.omnifoodtech.com` | 판매용 **별도 Vercel 프로젝트 + 별도 Supabase** 원칙 → [STORE-OPEN-SETUP.md §4](./STORE-OPEN-SETUP.md) |
| **판매 SaaS 콘솔 진입 (현재 랜딩 링크)** | `https://app.omnifoodtech.com/saas-admin/login` | `landing/omnifoodtech/index.html` CTA. `www`와 `app` 중 **어느 쪽을 고객 공식 URL로 할지** 정하면 랜딩·DNS를 맞추면 됨 |
| **판매용 정적 랜딩 (Lightsail)** | `http://3.1.70.209` | `landing/omnifoodtech/deploy-landing.ps1` 배포 대상. Vercel과 무관 |

---

## 경로만 보면 (같은 Next 앱 `vercel-app` 라우트)

배포마다 호스트만 다르고 **경로 구조는 동일**합니다.

| 목적 | 경로 예 |
|------|---------|
| 일반 로그인 | `/login` |
| 관리자 | `/admin`, `/admin/login` |
| POS | `/pos`, `/pos/login`, `/pos/terminal` |
| SaaS 운영 콘솔 | `/saas-admin/login`, `/saas-admin/customers`, … |
| Windows 설치 파일·업데이트 | `/downloads/windows-pos/...`, `/downloads/windows-erp/...` |

---

## 로컬

| 용도 | 주소 |
|------|------|
| 개발 서버 | `http://localhost:3000` (포트는 터미널 출력 기준) |

---

## 점검할 때

1. **내부**와 **판매**가 서로 다른 Supabase를 쓰는지 (`SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*`).
2. 판매 도메인이 **의도한 Vercel 프로젝트**에만 붙어 있는지.
3. `omnifoodtech.com` / `www` / `app` 서브도메인 **301·Primary** 정책이 팀 기대와 일치하는지.

상세 체크리스트는 [STORE-OPEN-SETUP.md — §4 내부용/판매용 도메인 분리](./STORE-OPEN-SETUP.md#4-내부용판매용-도메인-분리-운영-saas-판매용)를 따릅니다.
