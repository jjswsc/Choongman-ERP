# PostgREST Egress 줄이기

Supabase **PostgREST Egress**(DB → 앱으로 나가는 데이터량)를 줄이는 방법 정리입니다.

---

## 1. 적용한 코드 수정

| API | 변경 | 효과 |
|-----|------|------|
| **getStockStores** (fallback) | `stock_logs` 조회 시 `select: 'location'` 추가 | 기존 `select=*` 대비 행당 바이트 대폭 감소 (50,000행 × 컬럼 수) |
| **getStoreGpsCheck** | `vendors` 조회 시 `select: 'id,gps_name,name,type,lat,lng'` 지정 | 불필요 컬럼 제외 |
| **getLeavePendingList** | `employees` 조회에 `limit: 2000` 추가 | 기본 10000 대비 상한 감소 |
| **getStoreVisitRecords** | `employees` 조회에 `limit: 2000` 추가 | 동일 |
| **updateForceOutboundReceived** | `stock_logs` 조회에 `limit: 1000` 추가 | 불필요한 대량 조회 방지 |

---

## 2. 계속 지키면 좋은 원칙

### 2-1. 필요한 컬럼만 SELECT

- **select=*** (전체 컬럼) 사용하지 않기.
- 필요한 컬럼만 나열: `select: 'id,name,status'` 등.
- 특히 **큰 JSON/텍스트 컬럼**(예: `items_json`, `cart_json`)은 꼭 필요할 때만 요청.

### 2-2. LIMIT 항상 두기

- 모든 목록/필터 조회에 **limit** 지정 (기본 10000도 크면, 용도에 맞게 500~5000 등으로 조정).
- 단건 조회는 `limit: 1`.

### 2-3. 집계는 RPC/뷰로

- 많은 행을 가져와서 JS에서 SUM/COUNT 하지 말고, **DB RPC 또는 뷰**에서 집계 후 적은 행만 반환.
- 예: `get_store_stock`, `get_distinct_stock_locations`, `get_receivable_summary` 등 (supabase-data-strategy.mdc 참고).

### 2-4. 페이지네이션

- 목록이 길면 **offset/limit** 또는 **cursor(id 기준)** 로 나눠 요청.
- 한 번에 1만 건씩 계속 요청하기보다는, 화면당 100~500건씩 요청하는 편이 egress 감소에 유리.

### 2-5. 클라이언트 캐시

- 같은 기간/같은 조건으로 자주 부르는 API는 **캐시**(메모리 또는 오프라인 저장) 후 재사용.
- 예: 영수증 목록, 매장 목록 등은 만료 시간 두고 캐시.

---

## 3. Egress가 큰 구간 (추가 최적화 시 참고)

| 구간 | 원인 | 개선 아이디어 |
|------|------|----------------|
| **getPosOrders** | 모든 행에 `items_json` 포함 (주문별 메뉴 JSON이 큼) | 메인 POS 폴링은 `pollMinimal=1`(linkpos 등 제외). 상세/영수증은 단건 `orderId` 조회 |
| **posSalesByMenu** | `pos_orders`에서 `items_json` 1만 건 조회 후 파싱 | DB에서 메뉴별 집계 RPC로 대체 시 행 수·데이터량 대폭 감소 |
| **getAppData** (stock_logs fallback) | 5만 행 `item_code,qty` | RPC `get_store_stock` 사용이 우선, fallback도 기간/장소 제한 강화 |
| **getBankTransactions** | limit 50000, 많은 컬럼 | 기간·필터 필수 + 페이지네이션 또는 select 최소화 |

---

## 4. 요약

- **이미 적용:** select 최소화, limit 추가 (getStockStores fallback, getStoreGpsCheck, getLeavePendingList, getStoreVisitRecords, updateForceOutboundReceived).
- **앞으로:** 새 API는 **select 명시 + limit 필수**, 집계는 **RPC/뷰** 우선, 가능하면 **페이지네이션**과 **클라이언트 캐시** 사용.
- **추가로 줄이려면:** `items_json` 등 큰 컬럼은 “목록용”과 “상세용”을 나누어 요청하는 방식 검토.

이렇게 하면 PostgREST Egress가 줄어들어 Supabase 사용량·비용 완화에 도움이 됩니다.
