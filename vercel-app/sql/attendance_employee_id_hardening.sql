-- Attendance employee_id hardening (safe, non-breaking).
-- Run once in Supabase SQL Editor, then deploy app code.

-- 1) Ensure key columns/indexes exist.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_id ON attendance_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_schedules_employee_id ON schedules (employee_id);

-- 2) Backfill attendance_logs.employee_id when there is exactly one employee match by store+name.
WITH matched AS (
  SELECT
    al.ctid AS row_tid,
    min(e.id) AS emp_id,
    count(*) AS match_count
  FROM attendance_logs al
  JOIN employees e
    ON lower(trim(coalesce(al.store_name, ''))) = lower(trim(coalesce(e.store, '')))
   AND lower(trim(coalesce(al.name, ''))) = lower(trim(coalesce(e.name, '')))
  WHERE al.employee_id IS NULL
  GROUP BY al.ctid
)
UPDATE attendance_logs al
SET employee_id = m.emp_id
FROM matched m
WHERE al.ctid = m.row_tid
  AND m.match_count = 1;

-- 3) Backfill schedules.employee_id with the same rule.
WITH matched AS (
  SELECT
    s.ctid AS row_tid,
    min(e.id) AS emp_id,
    count(*) AS match_count
  FROM schedules s
  JOIN employees e
    ON lower(trim(coalesce(s.store_name, ''))) = lower(trim(coalesce(e.store, '')))
   AND lower(trim(coalesce(s.name, ''))) = lower(trim(coalesce(e.name, '')))
  WHERE s.employee_id IS NULL
  GROUP BY s.ctid
)
UPDATE schedules s
SET employee_id = m.emp_id
FROM matched m
WHERE s.ctid = m.row_tid
  AND m.match_count = 1;

-- 4) Diagnostics: unresolved rows should be reviewed manually before NOT NULL migration.
-- (Do not force NOT NULL in this script to avoid breaking old data.)
SELECT
  count(*) AS attendance_logs_unresolved_employee_id
FROM attendance_logs
WHERE employee_id IS NULL;

SELECT
  count(*) AS schedules_unresolved_employee_id
FROM schedules
WHERE employee_id IS NULL;
