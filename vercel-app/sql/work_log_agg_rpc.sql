-- 업무일지 주간·검토 집계 RPC (미배포 시 API JS fallback)
-- Supabase SQL Editor에서 실행
--
-- 이전 5·6인자 버전이 있으면 CREATE OR REPLACE만으로는 오버로드가 남아
-- COMMENT ON / 재실행 시 "function name is not unique" 가 납니다. 아래 DROP 후 생성.

-- 구버전 (p_store 없음)
DROP FUNCTION IF EXISTS public.get_work_log_weekly_summary(date, date, text, text, bigint);
DROP FUNCTION IF EXISTS public.get_work_log_manager_report_rows(date, date, text, text, bigint, text);

-- 신버전 재실행용
DROP FUNCTION IF EXISTS public.get_work_log_weekly_summary(date, date, text, text, bigint, text);
DROP FUNCTION IF EXISTS public.get_work_log_manager_report_rows(date, date, text, text, bigint, text, text);

CREATE OR REPLACE FUNCTION get_work_log_weekly_summary(
  p_start date,
  p_end date,
  p_dept text DEFAULT NULL,
  p_employee_name text DEFAULT NULL,
  p_employee_id bigint DEFAULT NULL,
  p_store text DEFAULT NULL
)
RETURNS TABLE (
  employee_name text,
  employee_role text,
  total_tasks bigint,
  completed bigint,
  carried bigint,
  in_progress bigint,
  avg_progress numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT
      wl.name,
      wl.progress,
      wl.status,
      COALESCE(e.job, '') AS job
    FROM work_logs wl
    LEFT JOIN employees e ON e.id = wl.employee_id
    WHERE wl.log_date >= p_start
      AND wl.log_date <= p_end
      AND (p_dept IS NULL OR p_dept = '' OR p_dept = 'all' OR wl.dept = p_dept)
      AND (
        p_employee_id IS NULL
        OR p_employee_id <= 0
        OR wl.employee_id = p_employee_id
        OR EXISTS (
          SELECT 1 FROM employees ex
          WHERE ex.id = p_employee_id
            AND (
              wl.employee_id = ex.id
              OR wl.name = ex.name
              OR (ex.nick IS NOT NULL AND TRIM(ex.nick) <> '' AND wl.name = ex.nick)
            )
        )
        OR (
          p_employee_name IS NOT NULL
          AND TRIM(p_employee_name) <> ''
          AND (
            wl.name = p_employee_name
            OR EXISTS (
              SELECT 1 FROM employees ex
              WHERE ex.name = p_employee_name
                AND (
                  wl.employee_id = ex.id
                  OR wl.name = ex.name
                  OR (ex.nick IS NOT NULL AND TRIM(ex.nick) <> '' AND wl.name = ex.nick)
                )
            )
          )
        )
      )
      AND (
        p_store IS NULL OR p_store = '' OR p_store = 'all'
        OR wl.store = p_store
        OR TRIM(COALESCE(wl.store, '')) = ''
        OR (TRIM(COALESCE(wl.store, '')) = '' AND e.store = p_store)
      )
  )
  SELECT
    f.name AS employee_name,
    MAX(f.job) AS employee_role,
    COUNT(*)::bigint AS total_tasks,
    COUNT(*) FILTER (
      WHERE f.status = 'Finish' OR COALESCE(f.progress, 0) >= 100
    )::bigint AS completed,
    COUNT(*) FILTER (
      WHERE f.status IN ('Continue', 'Carry Over')
    )::bigint AS carried,
    COUNT(*) FILTER (
      WHERE f.status NOT IN ('Finish', 'Continue', 'Carry Over')
        AND COALESCE(f.progress, 0) < 100
    )::bigint AS in_progress,
    ROUND(AVG(COALESCE(f.progress, 0))::numeric, 1) AS avg_progress
  FROM filtered f
  WHERE f.name IS NOT NULL AND TRIM(f.name) <> ''
  GROUP BY f.name
  ORDER BY f.name;
$$;

CREATE OR REPLACE FUNCTION get_work_log_manager_report_rows(
  p_start date,
  p_end date,
  p_dept text DEFAULT NULL,
  p_employee_name text DEFAULT NULL,
  p_employee_id bigint DEFAULT NULL,
  p_manager_check text DEFAULT NULL,
  p_store text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  log_date date,
  dept text,
  name text,
  content text,
  progress integer,
  status text,
  priority text,
  manager_check text,
  manager_comment text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    wl.id::text,
    wl.log_date::date,
    COALESCE(wl.dept, '')::text,
    COALESCE(wl.name, '')::text,
    COALESCE(wl.content, '')::text,
    COALESCE(wl.progress, 0)::integer,
    COALESCE(wl.status, '')::text,
    COALESCE(wl.priority, '')::text,
    COALESCE(wl.manager_check, '')::text,
    COALESCE(wl.manager_comment, '')::text
  FROM work_logs wl
  WHERE wl.log_date >= p_start
    AND wl.log_date <= p_end
    AND (p_dept IS NULL OR p_dept = '' OR p_dept = 'all' OR wl.dept = p_dept)
    AND (
      p_employee_id IS NULL
      OR p_employee_id <= 0
      OR wl.employee_id = p_employee_id
      OR (wl.employee_id IS NULL AND p_employee_name IS NOT NULL AND wl.name = p_employee_name)
    )
    AND (
      p_employee_name IS NULL
      OR p_employee_name = ''
      OR p_employee_name = 'all'
      OR wl.name = p_employee_name
      OR (p_employee_id IS NOT NULL AND p_employee_id > 0 AND wl.employee_id = p_employee_id)
    )
    AND (
      p_manager_check IS NULL
      OR p_manager_check = ''
      OR p_manager_check = 'all'
      OR wl.manager_check = p_manager_check
    )
    AND (
      p_store IS NULL OR p_store = '' OR p_store = 'all' OR wl.store = p_store
    )
  ORDER BY wl.log_date ASC, wl.name ASC;
$$;

COMMENT ON FUNCTION get_work_log_weekly_summary(date, date, text, text, bigint, text) IS
  'Work log weekly/monthly employee summary — deploy before high-volume tenants';

COMMENT ON FUNCTION get_work_log_manager_report_rows(date, date, text, text, bigint, text, text) IS
  'Work log manager review list — content dedupe remains in API when needed';
