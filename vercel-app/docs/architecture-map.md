# CM ERP 아키텍처 맵 (요약)

> 숫자는 `vercel-app` 기준 대략치. 세부는 `erp-sidebar.tsx`·`app/api`를 단일 소스로 본다.

## 규모 (2026-06)

| 항목 | 규모 |
|------|------|
| API 라우트 (`app/api/**/route.ts`) | ~720 |
| 관리자 페이지 (`app/admin/**/page.tsx`) | ~107 |
| ERP 사이드바 메뉴 | ~73 (`getErpNavItemsForHelp`) |
| `lib/api-client/` 모듈 | ~38 |

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
| `stock`, `inbound`, `outbound`, `purchase-order` | 물류·발주 |
| `hr`, `admin`, `employees`, `work-log`, `timesheet` | HR·공지·승인 |
| `receivable-payable`, `income-statement`, `bank-transactions`, … | 회계 |
| `pos-menus`, `pos-promos`, `pos-operations`, `sales-management` | POS·매출 |
| `marketing-*`, `marketing-materials` | 마케팅 |
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
- UI 게이트 예: AI 센터 (`lib/ai/tenant-gate.ts`) — 나머지 모듈은 점진 적용 예정
