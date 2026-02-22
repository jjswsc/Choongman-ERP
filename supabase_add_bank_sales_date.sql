-- ============================================================
-- bank_transactions에 sales_date(매출일) 컬럼 추가
-- 입금 시: 입금일과 매출일 분리 (어제 매출이 오늘 입금 등 T+1)
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS sales_date DATE DEFAULT NULL;

COMMENT ON COLUMN bank_transactions.sales_date IS '매출인식일 (입금의 경우, 어제 매출 오늘 입금 등 T+1)';
