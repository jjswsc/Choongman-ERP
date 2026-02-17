-- stock_logs에 user_name 컬럼 추가 (사용 내역에 사용 직원 표시용)
ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT NULL;
