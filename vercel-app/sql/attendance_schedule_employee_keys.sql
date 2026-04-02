-- attendance_logs / schedules 직원 식별 키 확장
-- 목적: 급여 집계에서 이름 오타 영향 축소 (employee_id 우선)

ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_id ON attendance_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_schedules_employee_id ON schedules (employee_id);

-- 기존 로그/스케줄 백필: 매장+이름 일치 시 id.asc 1건
WITH att_match AS (
  SELECT
    al.ctid AS al_tid,
    e.id AS emp_id,
    row_number() OVER (PARTITION BY al.ctid ORDER BY e.id ASC) AS rn
  FROM attendance_logs al
  JOIN employees e
    ON lower(trim(e.store::text)) = lower(trim(al.store_name::text))
   AND lower(trim(e.name::text)) = lower(trim(al.name::text))
  WHERE al.employee_id IS NULL
)
UPDATE attendance_logs al
SET employee_id = m.emp_id
FROM att_match m
WHERE al.ctid = m.al_tid
  AND m.rn = 1;

WITH sch_match AS (
  SELECT
    s.ctid AS s_tid,
    e.id AS emp_id,
    row_number() OVER (PARTITION BY s.ctid ORDER BY e.id ASC) AS rn
  FROM schedules s
  JOIN employees e
    ON lower(trim(e.store::text)) = lower(trim(s.store_name::text))
   AND lower(trim(e.name::text)) = lower(trim(s.name::text))
  WHERE s.employee_id IS NULL
)
UPDATE schedules s
SET employee_id = m.emp_id
FROM sch_match m
WHERE s.ctid = m.s_tid
  AND m.rn = 1;

