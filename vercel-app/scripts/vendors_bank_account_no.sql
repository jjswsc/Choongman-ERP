-- 거래처(매입처) 계좌번호 컬럼 추가
-- Run on Supabase SQL editor (idempotent).
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_account_no TEXT DEFAULT NULL;
COMMENT ON COLUMN vendors.bank_account_no IS '매입처 계좌번호 (입금 시 참고)';
