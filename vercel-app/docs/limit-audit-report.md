# Limit 검토 리포트

supabaseSelect / supabaseSelectFilter 사용 시 limit로 인한 데이터 누락 가능성 검토 (2026-03 기준)

---

## 기본값 (2026-03 수정)

- `supabaseSelect`: limit 미지정 시 **10000**
- `supabaseSelectFilter`: limit 미지정 시 **10000**

---

## 1. Critical – 집계/합산에 영향 (데이터 잘못 표시)

| API/파일 | 테이블 | Limit | 상태 | 비고 |
|----------|--------|-------|------|------|
| getAppData (getStoreStock) | stock_logs | ~~1000~~ → **RPC** | ✅ 해결 | DB 집계 RPC로 전환 완료 |
| supabase 기본값 | - | 1000 → **10000** | ✅ 적용 | limit 미지정 시 10000 |

---

## 2. High – 목록 잘림으로 일부 데이터 안 보임

| API/파일 | 테이블 | Limit | 리스크 | 권장 |
|----------|--------|-------|--------|------|
| **getMyUsageHistory** | stock_logs | ~~200~~ → **20000** | ✅ 적용 | |
| **getPosOrders** | pos_orders | ~~500~~ → **10000** | ✅ 적용 | |
| **getStockStores** | stock_logs | ~~5000~~ → **50000** | ✅ 적용 | |
| getReceivablePayableList | stock_logs, payable_transactions | 1000–5000 | 미수미지 목록 잘림 | limit 상향 또는 페이지네이션 |
| getCombinedOutboundHistory | stock_logs, orders | **500, 200** | 출고 내역 잘림 | limit 상향 |
| getAdminOrders | orders | **300–500** | 주문 관리 목록 잘림 | limit 상향 |
| getPosTodaySales | pos_orders | **2000** | 당일 매출 많은 날 일부 누락 | limit 5000+ |
| getBankTransactions | bank_transactions | 2000–10000 | 거래 많은 계좌 잘림 | 페이지네이션 권장 |
| getExpenseRegisterList | bank_transactions 등 | 1000–20000 | 지출 등록 목록 잘림 | 쿼리별 limit 검토 |

---

## 3. Medium – 일부 시나리오에서 잘림 가능

| API/파일 | 테이블 | Limit | 비고 |
|----------|--------|-------|------|
| getPettyCashList | petty_cash_transactions | 2000 | 시재 입출금 |
| getTillList | pos_till_transactions | 2000 | POS 시재 |
| getReceivableOrders | orders, stock_logs | 500–5000 | |
| getUnlinkedBankWithdrawals | bank_transactions | 500–10000 | |
| getCardTransactions | card_transactions | 500 | |

---

## 4. Low – 목적상 적정

| 유형 | Limit | 예시 |
|------|-------|------|
| 단건 조회 | 1 | id=eq.xxx, 기존 여부 확인 |
| 마스터 데이터 | 100–5000 | items, vendors, employees, account_subjects |
| 검색/자동완성 | 20–100 | getMembers(limit:20), 배달앱 목록 |
| 설정/메뉴 | 50–500 | pos_table_layouts, pos_menu_categories |

---

## 5. 권장 조치

### 즉시 검토 권장
1. **getMyUsageHistory** (limit 200) → 2000 이상 상향 또는 날짜 기준 쿼리로 변경
2. **getPosOrders** (limit 500) → 2000 이상 상향 또는 페이지네이션
3. **getStockStores** (limit 5000) → RPC로 `SELECT DISTINCT location FROM stock_logs` 또는 limit 상향

### DB RPC로 전환 검토
- `get_store_stock` 패턴처럼 **집계/합산**은 RPC가 안전
- **목록**은 페이지네이션(offset/limit) 또는 cursor 기반 페이지네이션 고려

### 공통
- limit 미지정 시 1000 적용 → 명시적 limit 지정 권장
- 대량 데이터 API는 페이지네이션 전환 검토
