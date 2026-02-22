-- bank_accounts에 은행명( bank_name ) 컬럼 추가
-- 사용법: Supabase SQL Editor에서 실행

ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';

COMMENT ON COLUMN bank_accounts.bank_name IS '은행명 (예: K-Bank, Kasikorn, SCB)';
