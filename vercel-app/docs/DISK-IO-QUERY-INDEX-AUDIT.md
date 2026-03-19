# Disk I/O 절감 — 쿼리·인덱스 점검

Supabase **Disk IO Budget** 소진 방지를 위해, 코드의 **SELECT limit/select** 사용과 **pos_orders / stock_logs** 인덱스를 점검한 내용입니다.

---

## 1. 코드 쿼리 개선 (적용 완료)

### 원칙 (supabase-data-strategy.mdc)

- **SELECT**: 꼭 필요한 컬럼만 `select` 지정, **limit** 항상 설정 (무제한 조회 금지).
- **누적·집계**: RPC/뷰로 DB에서 집계 후 적은 행만 반환.

### 수정한 API

| API | 변경 내용 |
|-----|-----------|
| `getWorkLogManagerReport` | `work_logs` 조회에 `limit: 5000`, `select` 지정 (id, log_date, dept, name, content, progress, status, priority, manager_check, manager_comment) |
| `getWorkLogWeekly` | `work_logs`에 `limit: 5000`, `select` 지정 / `employees`에 `limit: 2000` |
| `getChecklistItems` | `checklist_items`에 `limit: 500`, `select` 지정 |
| `getNoticeOptions` | `employees`에 `limit: 2000` |
| `getWorkLogStaffList` | `employees`에 `limit: 2000` |
| `deleteAdminEmployee` | `employees` 단건 조회에 `select: 'store'`, `limit: 1` |
| `getCombinedOutboundHistory` | `items` 조회에 `limit: 10000` |

### 이미 양호한 패턴

- **getPosOrders**: `limit: 10000`, 필요한 컬럼만 `select`.
- **posSalesByStore / posSalesByMenu / posSalesByPayment**: `limit` + `select` 사용.
- **accounting-reports.ts**: `BASE_LIMIT` + `select` 사용.
- **getAppData**: `stock_logs` fallback에 `limit: 50000`, `select: 'item_code,qty'` 사용.

### supabase-server 기본값

- `supabaseSelect` / `supabaseSelectFilter`: **limit** 미지정 시 **10000**, **select** 미지정 시 `*`.
- 가능한 곳은 모두 **명시적 limit + select** 사용 권장.

---

## 2. 인덱스 점검 — pos_orders

### 이미 존재하는 인덱스 (마이그레이션 기준)

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| idx_pos_orders_order_no | order_no | 주문번호 조회 |
| idx_pos_orders_created | created_at | 기간/정렬 조회 |
| idx_pos_orders_status | status | 상태 필터 |
| idx_pos_orders_store | store_code | 매장 필터 |
| idx_pos_orders_member_id | member_id | 회원별 주문 |
| idx_pos_orders_created_by | created_by | 생성자 |

### 권장 추가 (선택)

POS 주문 목록이 **store_code + created_at 범위**로 자주 걸리는 경우, 복합 인덱스가 Disk I/O를 줄이는 데 도움이 됩니다. Supabase SQL Editor에서 실행:

```sql
-- pos_orders: 매장 + 기간 조회 (getPosOrders, 매출 집계 등)
CREATE INDEX IF NOT EXISTS idx_pos_orders_store_created
  ON pos_orders(store_code, created_at DESC);
```

---

## 3. 인덱스 점검 — stock_logs

### 이미 존재하는 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| idx_stock_logs_location_log_date | location, log_date DESC | 장소 + 날짜 조회/정렬 |
| idx_stock_logs_log_type_log_date | log_type, log_date DESC | 로그타입 + 날짜 (getMyUsageHistory 등) |
| idx_stock_logs_location_log_type_date | location, log_type, log_date DESC | 장소+타입+날짜 (getAppData fallback, getCombinedOutboundHistory 등) |

### 결론

- **stock_logs**는 현재 쿼리 패턴에 맞는 인덱스가 있어 **추가 인덱스는 필수 아님**.
- 새로 **자주 쓰는 필터/정렬 조합**이 생기면, 그에 맞춰 복합 인덱스 추가를 검토하면 됩니다.

---

## 4. 적용 순서 요약

1. **코드**: 위 쿼리 개선은 이미 반영됨 (limit/select).
2. **인덱스**:  
   - **pos_orders**: 필요 시 `idx_pos_orders_store_created` 만 Supabase SQL Editor에서 실행.  
   - **stock_logs**: 기존 인덱스 유지로 충분.

이렇게 하면 Disk I/O가 줄어들어 **Disk IO Budget** 소진 완화에 도움이 됩니다.
