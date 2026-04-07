-- Second pass for unresolved employee_id rows after attendance_employee_id_hardening.sql
-- Goal: reduce unresolved rows using normalized-name and employee_code matching.
-- Safe rule: update only when exactly ONE employee candidate matches.

-- 1) schedules: normalized name match (trim/case/prefix cleanup)
WITH s_norm AS (
  SELECT
    s.ctid AS row_tid,
    trim(coalesce(s.store_name, '')) AS store_key,
    lower(
      regexp_replace(
        regexp_replace(
          trim(coalesce(s.name, '')),
          '^(mr|ms|mrs|miss|khun)\.?\s+',
          '',
          'i'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS norm_name
  FROM schedules s
  WHERE s.employee_id IS NULL
),
e_norm AS (
  SELECT
    e.id,
    trim(coalesce(e.store, '')) AS store_key,
    lower(
      regexp_replace(
        regexp_replace(
          trim(coalesce(e.name, '')),
          '^(mr|ms|mrs|miss|khun)\.?\s+',
          '',
          'i'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS norm_name
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
    ON lower(s.store_key) = lower(e.store_key)
   AND s.norm_name <> ''
   AND s.norm_name = e.norm_name
)
UPDATE schedules s
SET employee_id = c.emp_id
FROM candidates c
WHERE s.ctid = c.row_tid
  AND c.rn = 1
  AND c.cnt = 1;

-- 2) schedules: employee_code literal match (when schedule name contains code)
WITH code_rows AS (
  SELECT
    s.ctid AS row_tid,
    trim(coalesce(s.store_name, '')) AS store_key,
    upper(regexp_replace(trim(coalesce(s.name, '')), '[^A-Za-z0-9]', '', 'g')) AS name_code
  FROM schedules s
  WHERE s.employee_id IS NULL
),
code_candidates AS (
  SELECT
    s.row_tid,
    e.id AS emp_id,
    row_number() OVER (PARTITION BY s.row_tid ORDER BY e.id) AS rn,
    count(*) OVER (PARTITION BY s.row_tid) AS cnt
  FROM code_rows s
  JOIN employees e
    ON lower(trim(coalesce(e.store, ''))) = lower(s.store_key)
   AND s.name_code <> ''
   AND upper(regexp_replace(trim(coalesce(e.employee_code, '')), '[^A-Za-z0-9]', '', 'g')) = s.name_code
)
UPDATE schedules s
SET employee_id = c.emp_id
FROM code_candidates c
WHERE s.ctid = c.row_tid
  AND c.rn = 1
  AND c.cnt = 1;

-- 3) attendance_logs: same normalized-name strategy for remaining NULL rows
WITH a_norm AS (
  SELECT
    a.ctid AS row_tid,
    trim(coalesce(a.store_name, '')) AS store_key,
    lower(
      regexp_replace(
        regexp_replace(
          trim(coalesce(a.name, '')),
          '^(mr|ms|mrs|miss|khun)\.?\s+',
          '',
          'i'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS norm_name
  FROM attendance_logs a
  WHERE a.employee_id IS NULL
),
e_norm AS (
  SELECT
    e.id,
    trim(coalesce(e.store, '')) AS store_key,
    lower(
      regexp_replace(
        regexp_replace(
          trim(coalesce(e.name, '')),
          '^(mr|ms|mrs|miss|khun)\.?\s+',
          '',
          'i'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS norm_name
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
    ON lower(a.store_key) = lower(e.store_key)
   AND a.norm_name <> ''
   AND a.norm_name = e.norm_name
)
UPDATE attendance_logs a
SET employee_id = c.emp_id
FROM candidates c
WHERE a.ctid = c.row_tid
  AND c.rn = 1
  AND c.cnt = 1;

-- 4) Diagnostics (after second pass)
SELECT count(*) AS attendance_logs_unresolved_employee_id
FROM attendance_logs
WHERE employee_id IS NULL;

SELECT count(*) AS schedules_unresolved_employee_id
FROM schedules
WHERE employee_id IS NULL;

-- 5) Optional: inspect top unresolved schedule names
SELECT
  trim(coalesce(store_name, '')) AS store_name,
  trim(coalesce(name, '')) AS name,
  count(*) AS rows
FROM schedules
WHERE employee_id IS NULL
GROUP BY 1, 2
ORDER BY rows DESC, store_name, name
LIMIT 100;
