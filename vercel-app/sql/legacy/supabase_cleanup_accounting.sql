-- ============================================================
-- Choongman ERP - 회계 관리 데이터 삭제
-- 실행 전 반드시 백업 권장: Supabase > Database > Backups
-- ============================================================
-- 【삭제 대상】
--   - 미수금 관리 (receivable_transactions)
--   - 미지급금 관리 (payable_transactions)
--   - 패티캐쉬 (petty_cash_transactions)
--   - 통장 거래 (bank_transactions, bank_transaction_inbound_links)
-- ============================================================
-- 【주의】 아래 순서대로 실행. FK/참조 관계 고려
-- ============================================================

-- 1. 미수/미지급 (통장 연동 있음 → 먼저 삭제)
TRUNCATE TABLE receivable_transactions CASCADE;
TRUNCATE TABLE payable_transactions CASCADE;

-- 2. 통장 ↔ 입고 연동
TRUNCATE TABLE bank_transaction_inbound_links CASCADE;

-- 3. 통장 거래
TRUNCATE TABLE bank_transactions CASCADE;

-- 4. 패티캐쉬
TRUNCATE TABLE petty_cash_transactions CASCADE;

-- ============================================================
-- 【손익계산서 0 확인】
-- 손익계산서 데이터 소스:
--   - 매출: pos_orders(매장), orders(본사 출고완료)
--   - 매입: orders(매장), stock_logs 입고, purchase_orders(본사)
--   - 비용: petty_cash_transactions + bank_transactions 출금
--   - 재고: stock_logs
--
-- 이 스크립트만 실행 시 → 비용(expenses) = 0
-- 주문/발주/입고/출고(supabase_cleanup_order_inbound_outbound.sql)도
--   함께 실행 시 → 매출·매입·재고·비용 모두 0 (단, pos_orders 있으면 매장 매출은 남음)
-- pos_orders까지 삭제하려면 supabase_cleanup_test_data.sql 참고
-- ============================================================
