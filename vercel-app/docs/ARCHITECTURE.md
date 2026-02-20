# CM ERP 아키텍처

다른 개발자가 기능 수정·버그 수정 시 참고할 수 있도록 기능별 구조를 정리합니다.

## 1. 전체 흐름

```
[클라이언트] ←→ [Next.js API routes] ←→ [Supabase PostgreSQL]
     ↓                  ↓
 lib/api-client.ts   app/api/*/route.ts
     ↓                  ↓
 lib/supabase-server.ts (REST API 직접 호출)
```

- **api-client.ts**: 모든 API 호출 함수 정의. 프론트엔드에서만 사용.
- **app/api/**: 각 API의 `route.ts`가 GET/POST 처리.
- **supabase-server.ts**: Supabase REST API 래퍼. `apiFetch`로 인증 토큰 포함 요청.

## 2. 기능별 파일 맵

### 발주·주문

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| 발주하기 | `app/admin/order-create/page.tsx` | `processOrder`, `getOrderFilterOptions` | `admin-order-create`, `order-tab` |
| 주문 승인 | `app/admin/orders/page.tsx` | `getAdminOrders`, `processOrderDecision` | `order-approval`, `order-tab` |
| 발주 내역 | (order-tab 내) | `getPurchaseOrders` | `admin-purchase-order-history` |
| 본사 발주 | (order-tab 내) | `savePurchaseOrder`, `getItemsByVendor` | `admin-purchase-order` |

### 입고·재고

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| 입고 | `app/admin/inbound/page.tsx` | `getInboundForStore`, `registerInboundBatch` | `inbound-*` |
| 재고 | `app/admin/stock/page.tsx` | `adjustStock`, `getAdjustmentHistory` | `stock-table`, `stock-adjust-dialog` |

### 출고

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| 강제 출고 | `app/admin/outbound/page.tsx` | `forceOutboundBatch` | - |
| 출고 내역 | (outbound 탭) | `getCombinedOutboundHistory` | `shipment-table`, `shipment-filter-bar` |
| 창고별 출고 | (outbound 탭) | `getOutboundByWarehouse` | - |

### POS

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| POS 화면 | `app/pos/page.tsx` | `savePosOrder`, `getPosMenus` | - |
| POS 메뉴 | `app/admin/pos-menus/page.tsx` | `getPosMenus`, `savePosMenu` | - |
| POS 결산 | `app/admin/pos-settlement/page.tsx` | `getPosSettlement`, `getPosTodaySales` | - |
| 오프라인 | `lib/offline/` | IndexedDB + sync | `pos-order-sync`, `pos-settlement-sync` |

### 인사·급여·근태

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| 급여 | `app/admin/payroll/page.tsx` | `getPayrollCalc`, `calculatePayroll` | `admin-payroll-calc` |
| 근태 | `app/admin/attendance/page.tsx` | `submitAttendance`, `getAttendance*` | - |
| 휴가 | `app/admin/leave/page.tsx` | `requestLeave`, `processLeaveApproval` | `admin-leave-*` |
| 직원 | `app/admin/employees/page.tsx` | `getAdminEmployeeList`, `saveAdminEmployee` | `employee-*` |
| 업무일지 | `app/admin/work-log/page.tsx` | `getWorkLogData`, `saveWorkLogData` | `worklog-*` |

### 매장 방문

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| 방문 기록 | `app/admin/store-visit/page.tsx` | `submitStoreVisit`, `getStoreVisitStats` | `visit-stats-*`, `visit-list-tab` |

### 기타

| 기능 | 페이지 | API | 주요 컴포넌트 |
|------|--------|-----|---------------|
| 품목 | `app/admin/items/page.tsx` | `getAdminItems`, `saveItem` | `item-table`, `item-form` |
| 거래처 | `app/admin/vendors/page.tsx` | `getVendors`, `saveVendor` | `vendor-table`, `vendor-form` |
| 공지 | `app/admin/notices/page.tsx` | `sendNotice`, `getSentNotices` | `admin-notice-*` |
| 설정 | `app/admin/settings/page.tsx` | `getMenuPermission`, `setMenuPermission` | `admin-settings` |
| 경비 | `app/admin/petty-cash/page.tsx` | `getPettyCashList`, `addPettyCashTransaction` | `petty-cash-tab` |
| 출고지 설정 | (품목 관리) | `getWarehouseLocations`, `saveWarehouseLocation` | `outbound-location-settings-dialog` |

## 3. 핵심 모듈

### lib/api-client.ts

- 145개 이상의 `export async function` 정의.
- `apiFetch`를 사용하여 `/api/...` 호출.
- 4xx/5xx 시 에러 throw, `translateApiMessage`로 다국어 메시지 변환.

### lib/auth-context.tsx

- `useAuth()`로 현재 로그인 사용자(store, name) 접근.
- JWT 기반. `loginCheck` API로 검증.

### lib/i18n.ts

- `useT(lang)` → `t("key")`로 번역.
- lang: `ko` | `en` | `th` | `mm` | `la`
- 키는 `I18nKeys`로 타입 정의.

### lib/supabase-server.ts

- `supabaseSelect`, `supabaseInsert`, `supabaseUpdate`, `supabaseDelete`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` 필요. API 라우트 내부에서만 사용.

### lib/permissions.ts

- `canAccessMenu(store, name, menuCode)` 등 권한 체크.
- `store_settings`, `menu_permissions` 테이블 참조.

## 4. 버그 수정 시 추천 순서

1. **증상 파악**: 어떤 화면·동작에서 문제인지.
2. **페이지 찾기**: 위 표에서 해당 페이지(`app/admin/...` 또는 `app/pos/...`) 확인.
3. **API 확인**: 해당 페이지에서 호출하는 `api-client` 함수 확인.
4. **라우트 확인**: `app/api/<함수명에 맞는 경로>/route.ts` 열기.
5. **DB 확인**: `supabase-server` 호출 또는 직접 쿼리. [DATABASE.md](./DATABASE.md) 참고.

## 5. 비즈니스 로직 주의점

- **주문 승인**: `processOrderDecision`에서 `approved_indices`, `approved_original_qty_json` 등 JSON 필드 사용.
- **출고**: `stock_logs`에 `log_type` (Order/Force 등)으로 구분. `getOutboundByWarehouse`는 `orders` + `stock_logs` 조합.
- **품목 출고지**: `items.outbound_location`이 창고별 출고 그룹핑에 사용됨.
- **급여**: `calculatePayroll`이 복잡. `payroll-utils.ts` 참고.
