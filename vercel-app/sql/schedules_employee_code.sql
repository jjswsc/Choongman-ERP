-- schedules: 직원코드 컬럼 (시간표 작성·조회 식별 키)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS employee_code text;

CREATE INDEX IF NOT EXISTS idx_schedules_employee_code ON schedules (employee_code);

-- employee_id 가 있으면 마스터 코드로 백필
UPDATE schedules s
SET employee_code = upper(trim(e.employee_code::text))
FROM employees e
WHERE s.employee_id = e.id
  AND e.employee_code IS NOT NULL
  AND trim(e.employee_code::text) <> ''
  AND (s.employee_code IS NULL OR trim(s.employee_code) = '');
