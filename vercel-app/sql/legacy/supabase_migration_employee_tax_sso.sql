-- 직원 테이블에 Tax ID(세금), SSO 번호(사회보험) 컬럼 추가
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sso_number TEXT DEFAULT '';
