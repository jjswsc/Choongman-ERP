-- ============================================================
-- Choongman ERP - 주문/발주/입고/출고 데이터 삭제
-- 실행 전 반드시 백업 권장: Supabase > Database > Backups
-- ============================================================
-- 【삭제 대상】
--   - 주문 승인 (orders)
--   - 발주하기 (purchase_orders)
--   - 입고 관리 (inbound_batches, stock_logs 입고)
--   - 출고 관리 (stock_logs 출고)
-- 【결과】 stock_logs 비우면 오피스·본사·모든 매장 재고 = 0
-- ============================================================
-- 【주의】 아래 순서대로 실행. FK/참조 관계 고려
-- ============================================================

-- 1. 은행 ↔ 입고 배치 연동 (입고 삭제 시 연동도 제거)
TRUNCATE TABLE bank_transaction_inbound_links CASCADE;

-- 2. 미수 거래 (주문에서 발생) / 미지급 거래 (발주에서 발생)
TRUNCATE TABLE receivable_transactions CASCADE;
TRUNCATE TABLE payable_transactions CASCADE;

-- 3. 재고 이력 (입고+출고 모두 기록됨 → 비우면 모든 location 재고 0)
TRUNCATE TABLE stock_logs CASCADE;

-- 4. 입고 배치
TRUNCATE TABLE inbound_batches CASCADE;

-- 5. 발주서
TRUNCATE TABLE purchase_orders CASCADE;

-- 6. 주문
TRUNCATE TABLE orders CASCADE;

-- ============================================================
-- 【삭제 후 확인】 재고 0 여부
-- 아래 쿼리로 location별 품목 합계 확인 → 모두 0이어야 함
-- ============================================================
-- SELECT location, item_code, SUM(qty) AS total
-- FROM stock_logs
-- GROUP BY location, item_code;
-- (결과: 0 rows = stock_logs 비어 있음 = 모든 재고 0)
-- ============================================================
