-- 직원 테이블에 ID번호, 주소 컬럼 추가
ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_number TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
