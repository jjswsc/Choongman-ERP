-- Daw(Tuddaw Tubburee, employees.id=1383) 본사 지출 승인 권한 확인
-- 오피스 급여 담당 플래그(can_manage_office_payroll)와 role을 봅니다.

SELECT
  id,
  employee_code,
  store,
  name,
  nick,
  role,
  job,
  can_manage_office_payroll
FROM employees
WHERE deleted_at IS NULL
  AND (
    id = 1383
    OR lower(trim(coalesce(nick, ''))) = 'daw'
    OR name ILIKE '%Tuddaw%'
    OR name ILIKE '%Tubburee%'
  )
ORDER BY id;
