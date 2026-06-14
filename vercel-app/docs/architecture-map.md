# CM ERP 아키텍처 맵 (요약)

> 숫자는 `vercel-app` 기준 대략치. 세부는 `erp-sidebar.tsx`·`app/api`를 단일 소스로 본다.

## 규모 (2026-06)

| 항목 | 규모 |
|------|------|
| API 라우트 (`app/api/**/route.ts`) | ~720 |
| 관리자 페이지 (`app/admin/**/page.tsx`) | ~107 |
| ERP 사이드바 메뉴 | ~73 (`getErpNavItemsForHelp`) |
| `lib/api-client/` 모듈 | ~73 |

## 진입점

| 경로 | 용도 |
|------|------|
| `/admin` | 본사·가맹 ERP |
| `/pos` | POS (웹·하이브리드·Android) |
| `/saas-admin` | 멀티테넌트·과금 |
| `/login`, `/admin/login` | 인증 |

## ERP 도메인 (사이드바 섹션)

1. **공통** — 대시보드, AI, 공지, 업무일지, 원가분석  
2. **CRM** — 회원, 포인트, 쿠폰, 세그먼트, 멤버앱  
3. **매출** — 실시간 매출, Ops, 매출관리  
4. **마케팅** — 캠페인, 협업메뉴, 광고, 인플루언서, 판촉물  
5. **매장운영** — 점검, 방문, 민원, 수리  
6. **POS** — 주문, 정산, 메뉴, 프린터  
7. **HR** — 직원, 근태, 휴가, 급여  
8. **물류** — 품목, 발주, 입출고, 재고  
9. **회계** — 미수미지급, 지출, 통장, 재무제표, 세무  
10. **인테리어** — 신규매장 프로젝트  

## API 클라이언트 (`lib/api-client/`)

`@/lib/api-client` import는 **barrel** (`lib/api-client.ts`)로 유지.

| 모듈 | 담당 |
|------|------|
| `hr`, `admin`, `admin-notices`, `admin-hr-policies`, `admin-approvals`, `employees`, `employees-core`, `employee-evaluations`, `work-log`, `timesheet` | HR·공지·승인·평가 |
| `pos-menus`, `pos-menu-delivery`, `pos-menu-cost`, `pos-promos`, `pos-operations` (→ `pos-coupons`, `pos-table-printer`, `pos-devices`, `pos-delivery-apps`, `pos-screen-config`, `pos-payment-settings`), `pos-settlement` (→ `pos-orders`, `pos-settlement-close`, `pos-tax-invoice-recipients`), `pos-payment-gateways`, `sales-management` | POS·매출 |
| `crm-members`, `marketing-*` (→ `marketing-campaigns-core`, `marketing-line-oa`, `marketing-campaign-analytics`), `marketing-materials` | CRM·마케팅 |
| `purchase-order` (→ `purchase-order-core`, `purchase-order-billing`, `company-hybrid-documents`) | 발주·회사문서 |
| `income-statement`, `balance-sheet`, `accounting-periods`, `thai-vat-filing` (→ `thai-vat-ledger`, `thai-pnd-filing`, `thai-corporate-tax-filing`), `accounting-workflow`, `thai-tax-filing`, … | 회계 |
| `interior` (→ `interior-projects`, `interior-materials-expense`), `stock`, `inbound`, `outbound`, `purchase-order`, `items-vendors` | 물류·발주·인테리어 |
| `mobile-home` | 모바일 홈 공지·급여 |

## 데이터 조회 전략

| 유형 | 방식 |
|------|------|
| 누적·집계 (재고 합계, 미수 요약 등) | Supabase **RPC** (`sql/*.sql`) |
| 목록·거래 (주문, 통장 내역 등) | **select + limit** + 페이지네이션 |

## 멀티채널 POS

| 채널 | 경로 |
|------|------|
| 웹 POS | `app/pos/*` |
| Windows 하이브리드 | `windows-pos/main.js` |
| Android | Capacitor `android/` |

영수증·주방 레이아웃 단일 소스: `lib/pos-receipt-layout.ts`, `lib/pos-kitchen-slip-html.ts`

## SaaS (외부 고객)

- 모듈 키: `lib/saas-module-pricing.ts` (`pos_base`, `accounting`, `grab`, …)
- **API 게이트**: `erp-route-modules.ts` — **695/695 route prefix 매핑(100%)**, exempt 42 (로그인·SaaS Admin·웹훅 등)
- **SaaS enforce**: `lib/saas/saas-enforce.ts` — tenantId 있을 때만 게이트 (SaaS **바로 배포**, 별도 파일럿 없음)
- **충만 🔴 오피스 검증**: `lib/saas/chungman-office-test-config.ts` — env `CM_OFFICE_TEST_STORE_CODES`
- **충만 보류 목록**: `docs/saas-deferred-chungman-risk.md`
- **레거시(충만)**: JWT `tenantId` 없으면 전 모듈 허용
- AI 센터: 동일 게이트 (`ai_center` 모듈)
