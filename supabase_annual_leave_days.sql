-- 연차일(annual_leave_days) 컬럼 확인 및 1년 이상 근무자 6일 부여
-- Supabase SQL Editor에서 실행

-- 1. 컬럼이 없으면 추가 (기존 스키마에 이미 있으면 스킵됨)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(5,2) DEFAULT 0;

-- 2. 1년 이상 근무한 직원에게 연차 6일 부여
--    (join_date가 있고, 입사일로부터 1년이 지났으며, 연차일이 NULL이거나 0인 경우)
UPDATE employees
SET annual_leave_days = 6
WHERE join_date IS NOT NULL
  AND join_date <= CURRENT_DATE - INTERVAL '1 year'
  AND (annual_leave_days IS NULL OR annual_leave_days = 0);
