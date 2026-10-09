-- 직원 전화번호 중복 확인 (예: 095-384-5476)
-- 신분증 저장이 "이미 사용 중인 전화번호"로 막힐 때, 같은 번호를 쓰는 재직 직원을 찾습니다.
SELECT
  id,
  employee_code,
  store,
  name,
  phone,
  employment_status,
  resign_date,
  deleted_at
FROM employees
WHERE deleted_at IS NULL
  AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace('095-384-5476', '\D', '', 'g')
ORDER BY id;
