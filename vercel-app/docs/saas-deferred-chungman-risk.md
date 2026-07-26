# 충만(레거시) 위험 작업 — 오피스 매장 검증 후 적용

## 적용 정책 (2026-06)

| 구분 | 방침 |
|------|------|
| **SaaS** (모듈 게이트·과금·Admin·API prefix) | **별도 테스트 없이 바로 진행**. JWT `tenantId` 있을 때만 enforce. |
| **충만 위험(🔴)** 아래 목록 | **오피스 매장에서만** 검증 후 단계 적용. (`CM_OFFICE_TEST_STORE_CODES`) |

**충만 본사·가맹:** JWT `tenantId` 없음 → SaaS 게이트·과금 **전부 스킵** → **현재와 동일**.

---

## 🔴 데이터 격리 (tenant_id)

| # | 작업 | 위험 | 오피스 검증 |
|---|------|------|-------------|
| 1 | `appendTenantFilter` API 적용 | 0건 / 타사 노출 | 주문·재고 조회 smoke |
| 2 | TOP 10 테이블 `tenant_id` backfill | backfill 누락 | SQL COUNT NULL |
| 3 | RLS tenant-aware | service_role 혼재 | — |
| 4 | per-tenant Supabase project | DB 분리 | — |
| 5 | member-portal stores tenant 필터 | 포털 매장 목록 | — |

### ✅ 완료 (Omni POS 카탈로그)

- `pos_menus` / `pos_option_groups`(있으면) / `pos_promos`(있으면) + `getPosMenus` 등: [`sql/pos_catalog_tenant_id.sql`](../sql/pos_catalog_tenant_id.sql), [`lib/pos-catalog-tenant-scope.ts`](../lib/pos-catalog-tenant-scope.ts)
- Omni + JWT `tenantId` 있을 때만 필터. 충만 레거시 DB는 스킵.
- SQL 미실행 시 Omni는 **빈 메뉴**(타사 전량 노출 금지).

### ✅ 완료 (Omni CRM members)

- `members.tenant_id` + 전화 unique 테넌트화 + `get_member_list_cursor(p_tenant_id)`: [`sql/members_tenant_id.sql`](../sql/members_tenant_id.sql), [`lib/members-tenant-scope.ts`](../lib/members-tenant-scope.ts)
- `/api/members`, cursor, `[id]` 에 JWT tenant 스코프 적용.
- Omni에 `line_display_name` 없을 때: [`sql/members_tenant_id_cursor_fix.sql`](../sql/members_tenant_id_cursor_fix.sql)

### ✅ 진행 중 (품목·거래처·재고)

- [`sql/inventory_tenant_id.sql`](../sql/inventory_tenant_id.sql) + [`lib/inventory-tenant-scope.ts`](../lib/inventory-tenant-scope.ts)
- `getVendors` / `saveVendor` / `getItems` / `saveItem` 테넌트 필터·stamp 적용.
- **재고 완결(앱)**: `getAppData`, `adjustStock`, `getStockStores`, 입고·출고·사용량 API 14곳 + `accounting-reports` 재고 RPC `p_tenant_id`.
- **재고 RPC SQL**: [`sql/inventory_stock_rpc_tenant.sql`](../sql/inventory_stock_rpc_tenant.sql) — `get_store_stock` / `get_distinct_stock_locations`.

### ✅ 진행 중 (CRM 포인트·스탬프)

- [`sql/members_crm_tenant_id.sql`](../sql/members_crm_tenant_id.sql) — `members.tenant_id` 선행 추가·백필 포함, `member_points_ledger` 등 tenant_id.
- `/api/member-points`, `/api/member-points/adjust`, `/api/member-stamps/summary` — 회원 소유 검증 + tenant 필터.
- CRM 포털 쿠폰 클레임·발급, `public-config` tenant 설정 키, 스탬프 ledger insert `tenant_id` stamp.
- **BOM CUD** (`savePosMenuIngredient` / `replacePosMenuIngredients` / `deletePosMenuIngredients`) — 메뉴 tenant 소유 검증 + `tenant_id` stamp.
- **회원앱 admin 설정** (design, contact, delivery, home-privileges, stamp-food-image, signup-benefits, prepay) — `system_settings` 키 `{key}:{tenantId}`.
### ✅ 진행 중 (원가·Grab)

- `getPosMenuCostAnalysis` / `getMenuCost` — JWT tenant 기준 메뉴·품목만 로드 (전 테이블 스캔 차단).
- Grab 연동 upsert·webhook·조회 API — `tenant_id` stamp·필터.

## 🔴 인증·과금 (충만 로그인·단말)

| # | 작업 | 위험 | 오피스 검증 |
|---|------|------|-------------|
| 6 | `loginCheck` suspended 차단 | tenantId 계정만 | — |
| 7 | `registerPosMainDevice` auth | POS 단말 등록 | **오피스 POS 등록** |
| 8 | fail-open 제거 (tenantId 없을 때 게이트) | **충만 전체 차단** | **하지 않음** |
| 9 | enabled-modules 실패 시 전 모듈 OFF | UI 잠금 | — |
| 10 | 2FA / IP / auto_suspend enforce | 로그인 불가 | — |

### ✅ 완료 (SaaS 판매 전 P0 — Omni만, 충만 무영향)

- **POS 단말 한도 fail-closed**: 한도/사용량 조회 실패 시 신규 단말 등록 거부 (`lib/saas/saas-pos-device-limit-server.ts`)
- **직원 한도 런타임 enforce**: `saveAdminEmployee` 신규·`importEmployeesFromCsv` 교체 시 `max_staff_accounts` 검사 (`lib/saas/saas-staff-limit-server.ts`)
- **Omni 평문 비밀번호 로그인 거부**: `verifyPassword` 기본값 plaintext OFF; `loginCheck`는 SaaS 브랜드에서만 레거시 평문 비허용
- **getLoginData rate limit**: Omni IP당 분당 30회 (`lib/simple-rate-limit.ts`)
- **POS-only 사이드이펙트**: logistics/accounting 모듈 OFF면 재고차감·자동분개·VAT draft 스킵 (`lib/saas/pos-completion-side-effects-gate.ts`)
- **getPosMenus banban**: Omni에서 테넌트 메뉴 id로만 flavor links 조회
- **월 주문 쿼터**: `savePosOrder`에서 `monthly_order_quota` fail-closed 검사 (`lib/saas/saas-order-quota-server.ts`)
- **모듈 게이트 fail-closed**: tenantId 있을 때 게이트 조회 실패 → 503 (`lib/verify-auth.ts`)
- **Omni anon RLS 거부 SQL**: [`sql/omni_pos_anon_deny_rls.sql`](../sql/omni_pos_anon_deny_rls.sql) — **Omni DB만** 실행
- **POS 단말 등록 인증**: `registerPosDevice` / `registerPosMainDevice` / `setPosMainDevice` → `requirePosStoreWriteAuth`
- **정지 계정**: `skipSaasGate`여도 정지 차단; 정지 조회 실패 → 503; bearer 게이트 fail-closed
- **maxStores 런타임**: `saasAdminStores` POST
- **KBank/Grab Omni env 폴백 금지**: `lib/tenant-integration-resolve.ts`
- **연체 자동정지 cron**: `/api/cron/saas-auto-suspend` (Omni 브랜드만, 매일 UTC 17:15)
- **매니저/태블릿 한도**: `saas-manager-limit-server` / `saas-tablet-limit-server` + `saasAdminDevices`
- **IP allowlist + admin TOTP**: `loginCheck` enforce + `sql/omni_saas_login_security.sql` + `/api/saasAdminTotp`
- **테넌트 export**: `GET /api/saasAdminTenantExport?tenantId=`
- **P2 UI (Omni만, 충만 로그인 UI 비표시)**:
  - `/admin/login` Omni: TOTP 입력·등록 확인
  - `/saas-admin`: Omni 배너 + 비-Omni 브랜드 차단
  - 고객사: 허용 IP textarea · 테넌트 JSON export · 태블릿 탭
- **고도화(감사 후)**:
  - `loginCheck` 정책 조회 null → 503 fail-closed
  - Grab store map Omni env 폴백 제거
  - 모듈 게이트 DB 조회 실패 → 503
  - `requireAuth` 정지 계정을 401이 아닌 403/503으로 반환
  - TOTP bootstrap IP allowlist + 이미 활성 시 재enroll 거부
  - `saasBootstrapTenantLogin` maxStores 검사
  - `/saas-admin/login`도 비-Omni 차단

## 🔴 회계·운영

| # | 작업 | 위험 | 오피스 검증 |
|---|------|------|-------------|
| 11 | 대형 회계 로직 변경 | 마감·세무 숫자 | **오피스 매장 마감·통장** |
| 12 | 프로덕션 cleanup SQL | 되돌리기 어려움 | 스테이징·백업 후 |
| 13 | 회사 문서 ACL 세분화 | 문서 접근 | 본사·오피스 계정 |

---

## 오피스 매장 검증 절차 (🔴 전용)

1. Vercel env: `CM_OFFICE_TEST_STORE_CODES=오피스매장코드` (콤마 구분)
2. 코드: `lib/saas/chungman-office-test-config.ts` — `isOfficeTestStore()` / `isChungmanRiskFeatureEnabledForStore()`
3. 🔴 기능은 **해당 매장·tenantId 없는 충만 경로**에만 feature flag로 켠 뒤 검증
4. 통과 후 전 매장·전 tenant 점진 확대

## ✅ SaaS — 바로 진행 (충만 무영향)

- `erp-route-modules` UI/API prefix
- `tenant-module-gate` · `bearer-saas-gate` · `requireAuth` 게이트
- SaaS Admin · 모듈 ON/OFF · API 403
- api-client move-only · CI lint · audit test

관련 코드: `lib/saas/saas-enforce.ts`, `lib/saas/erp-route-modules.ts`
