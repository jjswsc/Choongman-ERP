-- Third pass for unresolved employee_id rows.
-- Purpose:
-- 1) auto-match unresolved rows with stronger normalization
-- 2) provide persistent manual mapping table for remaining edge cases
--
-- Safe principle: update only when candidate is exactly one.

-- -----------------------------
-- Helpers
-- -----------------------------
CREATE OR REPLACE FUNCTION cm_norm_store(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(v, '')), '\s+', ' ', 'g'));
$$;

-- Handles: "Mr.Khun ...", "Ms .Monrada ...", "miss. aathitaya" after dot→space
CREATE OR REPLACE FUNCTION cm_norm_name(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(coalesce(v, '')), '[\.\,]+', ' ', 'g'),
          '^(นาย|นางสาว|นาง)\s+',
          '',
          'i'
        ),
        '^(mr|ms|mrs|miss|khun)[.\s]*',
        '',
        'i'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- -----------------------------
-- 1) Auto pass for schedules (strict unique normalized match)
-- -----------------------------
WITH s_norm AS (
  SELECT
    s.ctid AS row_tid,
    cm_norm_store(s.store_name) AS store_key,
    cm_norm_name(s.name) AS name_key
  FROM schedules s
  WHERE s.employee_id IS NULL
),
e_norm AS (
  SELECT
    e.id,
    cm_norm_store(e.store) AS store_key,
    cm_norm_name(e.name) AS name_key
  FROM employees e
),
candidates AS (
  SELECT
    s.row_tid,
    e.id AS emp_id,
    row_number() OVER (PARTITION BY s.row_tid ORDER BY e.id) AS rn,
    count(*) OVER (PARTITION BY s.row_tid) AS cnt
  FROM s_norm s
  JOIN e_norm e
    ON s.store_key = e.store_key
   AND s.name_key <> ''
   AND s.name_key = e.name_key
)
UPDATE schedules s
SET employee_id = c.emp_id
FROM candidates c
WHERE s.ctid = c.row_tid
  AND c.rn = 1
  AND c.cnt = 1;

-- -----------------------------
-- 2) Auto pass for attendance_logs (strict unique normalized match)
-- -----------------------------
WITH a_norm AS (
  SELECT
    a.ctid AS row_tid,
    cm_norm_store(a.store_name) AS store_key,
    cm_norm_name(a.name) AS name_key
  FROM attendance_logs a
  WHERE a.employee_id IS NULL
),
e_norm AS (
  SELECT
    e.id,
    cm_norm_store(e.store) AS store_key,
    cm_norm_name(e.name) AS name_key
  FROM employees e
),
candidates AS (
  SELECT
    a.row_tid,
    e.id AS emp_id,
    row_number() OVER (PARTITION BY a.row_tid ORDER BY e.id) AS rn,
    count(*) OVER (PARTITION BY a.row_tid) AS cnt
  FROM a_norm a
  JOIN e_norm e
    ON a.store_key = e.store_key
   AND a.name_key <> ''
   AND a.name_key = e.name_key
)
UPDATE attendance_logs a
SET employee_id = c.emp_id
FROM candidates c
WHERE a.ctid = c.row_tid
  AND c.rn = 1
  AND c.cnt = 1;

-- -----------------------------
-- 3) Manual mapping table (persistent)
-- -----------------------------
CREATE TABLE IF NOT EXISTS attendance_employee_manual_map (
  id bigserial PRIMARY KEY,
  store_name text NOT NULL,
  raw_name text NOT NULL,
  employee_id bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_manual_map_store_name_raw_name_uniq
ON attendance_employee_manual_map (cm_norm_store(store_name), cm_norm_name(raw_name));

-- Keep updated_at fresh on edits (optional)
CREATE OR REPLACE FUNCTION touch_attendance_employee_manual_map_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_attendance_employee_manual_map_updated_at ON attendance_employee_manual_map;
CREATE TRIGGER trg_touch_attendance_employee_manual_map_updated_at
BEFORE UPDATE ON attendance_employee_manual_map
FOR EACH ROW
EXECUTE FUNCTION touch_attendance_employee_manual_map_updated_at();

-- Example rows (edit employee_id first, then uncomment)
-- INSERT INTO attendance_employee_manual_map (store_name, raw_name, employee_id, note) VALUES
-- ('CM The street', 'manager', 1234, 'manual map from unresolved report')
-- ON CONFLICT (cm_norm_store(store_name), cm_norm_name(raw_name))
-- DO UPDATE SET employee_id = EXCLUDED.employee_id, active = true, note = EXCLUDED.note;

-- Apply manual mappings to schedules
WITH mm AS (
  SELECT
    cm_norm_store(store_name) AS store_key,
    cm_norm_name(raw_name) AS name_key,
    employee_id
  FROM attendance_employee_manual_map
  WHERE active = true
),
target AS (
  SELECT
    s.ctid AS row_tid,
    mm.employee_id
  FROM schedules s
  JOIN mm
    ON cm_norm_store(s.store_name) = mm.store_key
   AND cm_norm_name(s.name) = mm.name_key
  WHERE s.employee_id IS NULL
)
UPDATE schedules s
SET employee_id = t.employee_id
FROM target t
WHERE s.ctid = t.row_tid;

-- Apply manual mappings to attendance_logs
WITH mm AS (
  SELECT
    cm_norm_store(store_name) AS store_key,
    cm_norm_name(raw_name) AS name_key,
    employee_id
  FROM attendance_employee_manual_map
  WHERE active = true
),
target AS (
  SELECT
    a.ctid AS row_tid,
    mm.employee_id
  FROM attendance_logs a
  JOIN mm
    ON cm_norm_store(a.store_name) = mm.store_key
   AND cm_norm_name(a.name) = mm.name_key
  WHERE a.employee_id IS NULL
)
UPDATE attendance_logs a
SET employee_id = t.employee_id
FROM target t
WHERE a.ctid = t.row_tid;

-- -----------------------------
-- 4) Diagnostics
-- -----------------------------
SELECT count(*) AS attendance_logs_unresolved_employee_id
FROM attendance_logs
WHERE employee_id IS NULL;

SELECT count(*) AS schedules_unresolved_employee_id
FROM schedules
WHERE employee_id IS NULL;

-- Top unresolved schedule names
SELECT
  trim(coalesce(store_name, '')) AS store_name,
  trim(coalesce(name, '')) AS name,
  count(*) AS rows
FROM schedules
WHERE employee_id IS NULL
GROUP BY 1, 2
ORDER BY rows DESC, store_name, name
LIMIT 100;

