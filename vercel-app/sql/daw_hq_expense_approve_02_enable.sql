-- Daw(Tuddaw Tubburee, id=1383)에게 오피스 급여 담당 플래그를 켭니다.
-- 본사(CM Office) 지출 승인에 필요합니다. 실행 후 Daw는 다시 로그인해 주세요.

UPDATE employees
SET can_manage_office_payroll = true
WHERE deleted_at IS NULL
  AND id = 1383
  AND (
    lower(trim(coalesce(nick, ''))) = 'daw'
    OR name ILIKE '%Tuddaw%'
    OR name ILIKE '%Tubburee%'
  )
RETURNING
  id,
  employee_code,
  store,
  name,
  nick,
  role,
  job,
  can_manage_office_payroll;
