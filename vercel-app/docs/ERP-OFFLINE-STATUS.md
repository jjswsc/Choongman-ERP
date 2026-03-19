# ERP 오프라인/캐시 구조 — 현재 상태 vs 권장 구조

ChatGPT가 말한 "이렇게 쓰면 안 된다" 항목과 **우리 프로젝트 실제 구현**을 비교한 문서입니다.

---

## 1. ChatGPT 요약 vs 우리 구조

| ChatGPT 지적 | 우리 현재 상태 | 비고 |
|--------------|----------------|------|
| **❌ ERP = 실시간 DB 직접 연결, 서버 죽으면 전부 스톱** | **⚠️ 부분적으로 이미 완화됨** | 읽기는 일부 캐시, 쓰기는 5xx/오프라인 시 큐 적재 후 복구 시 동기화. 다만 **전역이 아닌 화면/API 단위**로 적용됨. |
| **✅ 1. 로컬 캐시 (메뉴, 재고, 거래처 등)** | **⚠️ 부분 구현** | 아래 2번 표 참고. |
| **✅ 2. 비동기 처리 (로컬 저장 → 복구 후 동기화)** | **✅ 구현됨** | `apiFetchWithOffline` + 큐 화이트리스트(발주/재고/주문/결산 등 100개 이상). 5xx/네트워크 실패 시 큐에 넣고, `syncPending`으로 복구 후 전송. |
| **✅ 3. 읽기/쓰기 분리 (조회→캐시 or Replica)** | **⚠️ Replica 없음, 캐시만 일부** | Supabase 단일. 조회 부하 감소는 **캐시 쓰는 화면**에서만 (매출·결산·현금·경비·수금 등). |
| **✅ 4. Fallback (발주 임시 저장, 나중에 업로드)** | **✅ 구현됨** | 발주·주문·결산·재고조정 등 쓰기 API는 큐 적재 → 복구 후 자동 전송. |

---

## 2. “로컬 캐시” — 무엇이 되고 / 무엇이 안 되나

### ✅ 이미 캐시 있는 데이터 (온라인 시 API 후 캐시, 오프라인/실패 시 캐시 사용)

| 데이터 | 함수/용도 | 사용처 예시 |
|--------|-----------|-------------|
| 매장·유저 목록 | `getStoreListWithCache`, `getLoginDataWithCache` | 로그인, 매장 선택, 공통 |
| 거래처(매입/매출) | `getVendorsForPurchaseWithCache`, `getVendorsForSalesWithCache` | 발주, 수금 등 |
| 품목(관리자) | `getAdminItemsWithCache` | 재고/품목 관리 |
| 창고 위치 | `getWarehouseLocationsWithCache` | 재고 |
| 체크리스트 | `getChecklistItemsWithCache` | 점검 |
| 매입 주문 | `getPurchaseOrdersWithCache` | 발주 |
| 수금/지급 목록 | `getReceivablePayableListWithCache`, `getPayableTransactionItemsWithCache` | 수금·지급 |
| 은행 거래 | `getBankTransactionsWithCache` | 입출금 |
| 경비 | `getPettyCashListWithCache`, `getTillListWithCache` | 경비/현금 |
| 결산 | `getPosSettlementWithCache` | POS 결산 |
| 매출 집계 | `getPosSalesByStoreWithCache` 등 (sales-analytics-offline) | 매출 관리(offlineAware) |
| 앱 데이터(재고 등 포함) | `getAppDataWithCache` | 재고/대시 등 |
| 내 주문/사용 이력 | `getMyOrderHistoryWithCache`, `getMyUsageHistoryWithCache` | 이력 조회 |
| POS 영수증 주문 목록 | `getPosOrdersWithCache` | 영수증 관리 |

### ❌ 아직 캐시 없는 주요 데이터

| 데이터 | API | 영향 |
|--------|-----|------|
| **POS 메뉴** | `getPosMenus()` | 서버 죽으면 POS 메뉴 로드 실패 → 주문 화면 빈칸/에러 가능. |
| POS 메뉴 카테고리/옵션/프로모 등 | 각각 API 직접 호출 | 메뉴와 함께 캐시 없으면 오프라인 시 POS 불완전. |
| 재고(단일 API로만 조회하는 경로) | 화면별 상이 | `getAppDataWithCache` 쓰는 경로는 재고 포함 캐시 있음. |

즉, **“메뉴, 거래처, 재고” 중**  
- **거래처·재고(앱데이터 경로)** → 이미 캐시 있음.  
- **메뉴(POS)** → 아직 캐시 없음. (가장 보완 필요.)

---

## 3. “서버 상태 표시” / “오프라인 모드”

| 항목 | 우리 상태 |
|------|-----------|
| 서버(연결) 상태 표시 | **✅ 있음** — `OfflineBanner` (오프라인 시 배너 + 대기 건수). `useOnlineStatus()` 로 온라인/오프라인 구분. |
| 오프라인 모드 | **✅ 있음** — 로그인(캐시 세션으로 진입), POS 주문/결산 큐, 매출·결산·현금 등 offlineAware 탭에서 캐시 사용. |

사용처: POS 터미널/주문, 결산 폼, 현금/경비 탭, 매출 관리(offlineAware), 관리자 레이아웃, 메인 페이지 등.

---

## 4. ChatGPT “단계별 대응” vs 우리

| ChatGPT 제안 | 우리 상태 |
|--------------|-----------|
| **1단계: 서버 상태 표시 + 오프라인 모드** | **✅ 구현됨** (OfflineBanner, useOnlineStatus, 오프라인 로그인, 큐 + 동기화) |
| **2단계: 주요 데이터 캐싱 (메뉴, 거래처, 재고)** | **⚠️ 거래처·재고(앱데이터) 캐시 있음. POS 메뉴 캐시 없음.** |
| **3단계: POS 분리, DB 분리, API 서버 따로** | **❌ 미구현** (동일 Supabase, 동일 Vercel API) |

---

## 5. 결론 — “원래 이렇게 쓰면 안 된다”와 비교했을 때

- **“실시간 DB 직접 연결만 있고 서버 죽으면 전부 스톱”**  
  → 우리는 **그렇게만 되어 있지 않다.**  
  - 쓰기는 **비동기 큐 + 복구 후 동기화** 되어 있고,  
  - 읽기는 **많은 화면에서 캐시** 쓰고,  
  - **서버 상태(오프라인) 표시 + 오프라인 모드** 도 있다.

- **“로컬 캐시 필수”**  
  → **일부는 이미 적용** (매장, 거래처, 품목, 경비, 결산, 매출, 앱데이터/재고 등).  
  → **부족한 부분:** POS 메뉴(및 관련 옵션/카테고리/프로모) 캐시.

- **“비동기 처리 / Fallback”**  
  → **이미 하고 있음** (큐 화이트리스트, 5xx 시에도 큐 적재, syncPending).

- **“읽기/쓰기 분리, Replica”**  
  → **Replica/읽기 전용 DB는 없음.** 부하 감소는 **캐시 사용 화면**에 한함.

정리하면, **ChatGPT가 말한 “이렇게 쓰면 안 된다” 구조만큼 막장은 아니고**,  
이미 **1단계 + 2단계 일부(캐시/비동기/오프라인)** 가 들어가 있고,  
**보완 포인트는 “POS 메뉴 캐시”** 와 (원하면) 3단계 구조 개선이다.
