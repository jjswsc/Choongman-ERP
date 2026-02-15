-- employees 테이블에 누락된 컬럼 추가 (haz_allow 등)
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(5,2) DEFAULT 15;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS haz_allow NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo TEXT DEFAULT '';
