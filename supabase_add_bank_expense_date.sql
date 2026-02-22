-- ============================================================
-- bank_transactions에 expense_date(비용인식일) 컬럼 추가
-- 출금 시: 지급일(trans_date)과 비용인식일 분리 (1월 구매 2월 지불 등)
-- 손익계산서는 expense_date 기준으로 비용 집계
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT NULL;

COMMENT ON COLUMN bank_transactions.expense_date IS '비용인식일 (출금 시, 1월 구매 2월 지불 등 발생주의)';
