-- 오피스 급여 담당(can_manage_office_payroll) 직원 감사
-- Supabase SQL Editor에서 실행

-- 1) 플래그 켜진 전체 직원
SELECT
  id,
  employee_code,
  store,
  name,
  role,
  job,
  employment_status,
  resign_date,
  can_manage_office_payroll
FROM employees
WHERE deleted_at IS NULL
  AND can_manage_office_payroll IS TRUE
ORDER BY store, name;

-- 2) 퇴사인데 플래그가 켜진 경우 (정리 권장)
SELECT id, employee_code, store, name, role, resign_date, employment_status
FROM employees
WHERE deleted_at IS NULL
  AND can_manage_office_payroll IS TRUE
  AND (
    lower(coalesce(employment_status, '')) IN ('resigned', '퇴사')
    OR (resign_date IS NOT NULL AND resign_date::date < current_date)
  )
ORDER BY name;

-- 3) 동명이인 (로그인 시 매장 선택 오류 가능)
SELECT lower(trim(name)) AS name_key, count(*) AS cnt, array_agg(DISTINCT store ORDER BY store) AS stores
FROM employees
WHERE deleted_at IS NULL
  AND trim(coalesce(name, '')) <> ''
GROUP BY lower(trim(name))
HAVING count(*) > 1
ORDER BY cnt DESC, name_key;

-- 4) 플래그 켜진 담당자 중 동명이인
WITH flagged AS (
  SELECT id, employee_code, store, name, role, job, resign_date, employment_status
  FROM employees
  WHERE deleted_at IS NULL AND can_manage_office_payroll IS TRUE
),
dup_names AS (
  SELECT lower(trim(name)) AS name_key
  FROM employees
  WHERE deleted_at IS NULL AND trim(coalesce(name, '')) <> ''
  GROUP BY lower(trim(name))
  HAVING count(*) > 1
)
SELECT f.*
FROM flagged f
JOIN dup_names d ON lower(trim(f.name)) = d.name_key
ORDER BY f.name, f.store;
