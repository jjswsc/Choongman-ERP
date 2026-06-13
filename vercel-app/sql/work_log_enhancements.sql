-- 업무일지 고도화: 매장(store)·감사(audit)·기간/인사이트 RPC
-- Supabase SQL Editor에서 실행 (work_log_agg_rpc.sql 이후 권장)

-- 1) 매장 컬럼
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS store text;
COMMENT ON COLUMN work_logs.store IS 'employees.store 스냅샷 — 매장별 필터·리포트';

CREATE INDEX IF NOT EXISTS idx_work_logs_store ON work_logs(store);
CREATE INDEX IF NOT EXISTS idx_work_logs_store_date ON work_logs(store, log_date);

UPDATE work_logs wl
SET store = e.store
FROM employees e
WHERE wl.employee_id = e.id
  AND (wl.store IS NULL OR TRIM(wl.store) = '');

UPDATE work_logs wl
SET store = e.store
FROM employees e
WHERE wl.employee_id IS NULL
  AND wl.name = e.name
  AND (wl.store IS NULL OR TRIM(wl.store) = '');

-- 2) 감사 테이블
CREATE TABLE IF NOT EXISTS public.work_logs_audit (
  id bigserial PRIMARY KEY,
  action_type text NOT NULL CHECK (action_type IN ('insert', 'update', 'delete', 'review', 'close')),
  changed_at timestamp without time zone NOT NULL DEFAULT timezone('Asia/Bangkok', now()),
  work_log_id text NULL,
  log_date date NULL,
  employee_id bigint NULL,
  employee_name text NULL,
  employee_store text NULL,
  actor_name text NULL,
  actor_role text NULL,
  actor_store text NULL,
  actor_employee_id bigint NULL,
  change_reason text NULL,
  before_row jsonb NULL,
  after_row jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_work_logs_audit_changed_at
  ON public.work_logs_audit (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_logs_audit_work_log_id
  ON public.work_logs_audit (work_log_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_logs_audit_employee_id
  ON public.work_logs_audit (employee_id, changed_at DESC);

ALTER TABLE public.work_logs_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_logs_audit_allow_public_select" ON public.work_logs_audit;
CREATE POLICY "work_logs_audit_allow_public_select"
  ON public.work_logs_audit
  AS PERMISSIVE FOR SELECT TO public USING (true);

GRANT SELECT ON TABLE public.work_logs_audit TO anon, authenticated;

-- 3) 기간 요약 RPC (직원 1명 · 일별 집계)
CREATE OR REPLACE FUNCTION get_work_log_period_summary(
  p_start date,
  p_end date,
  p_employee_id bigint DEFAULT NULL,
  p_employee_name text DEFAULT NULL
)
RETURNS TABLE (
  log_date date,
  total_tasks bigint,
  completed bigint,
  in_progress bigint,
  carried bigint,
  avg_progress numeric,
  has_close boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH days AS (
    SELECT d::date AS log_date
    FROM generate_series(p_start::timestamp, p_end::timestamp, '1 day'::interval) AS d
  ),
  filtered AS (
    SELECT
      wl.log_date::date AS log_date,
      wl.progress,
      wl.status
    FROM work_logs wl
    WHERE wl.log_date >= p_start
      AND wl.log_date <= p_end
      AND (
        (p_employee_id IS NOT NULL AND p_employee_id > 0 AND wl.employee_id = p_employee_id)
        OR (
          p_employee_name IS NOT NULL
          AND TRIM(p_employee_name) <> ''
          AND wl.name = p_employee_name
        )
      )
  )
  SELECT
    d.log_date,
    COUNT(f.log_date)::bigint AS total_tasks,
    COUNT(*) FILTER (
      WHERE f.status = 'Finish' OR COALESCE(f.progress, 0) >= 100
    )::bigint AS completed,
    COUNT(*) FILTER (
      WHERE f.status = 'Today' AND COALESCE(f.progress, 0) < 100
    )::bigint AS in_progress,
    COUNT(*) FILTER (
      WHERE f.status IN ('Continue', 'Carry Over')
    )::bigint AS carried,
    COALESCE(ROUND(AVG(COALESCE(f.progress, 0))::numeric, 1), 0) AS avg_progress,
    (COUNT(f.log_date) > 0) AS has_close
  FROM days d
  LEFT JOIN filtered f ON f.log_date = d.log_date
  GROUP BY d.log_date
  ORDER BY d.log_date;
$$;

-- 4) 직원 인사이트 RPC (업무일지 + 근태 + 최근 평가)
CREATE OR REPLACE FUNCTION get_work_log_employee_insights(
  p_start date,
  p_end date,
  p_employee_id bigint DEFAULT NULL,
  p_employee_name text DEFAULT NULL,
  p_store text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_name text := NULLIF(TRIM(p_employee_name), '');
  v_store text := NULLIF(TRIM(p_store), '');
  v_eid bigint := CASE WHEN p_employee_id > 0 THEN p_employee_id ELSE NULL END;
  v_work jsonb;
  v_attendance jsonb;
  v_eval jsonb;
BEGIN
  IF v_eid IS NULL AND v_name IS NULL THEN
    RETURN jsonb_build_object('work', '[]'::jsonb, 'attendance', '[]'::jsonb, 'evaluations', '[]'::jsonb);
  END IF;

  IF v_eid IS NOT NULL THEN
    SELECT e.name, e.store INTO v_name, v_store
    FROM employees e WHERE e.id = v_eid LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.log_date), '[]'::jsonb)
  INTO v_work
  FROM (
    SELECT
      wl.log_date::text AS log_date,
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE wl.status = 'Finish' OR COALESCE(wl.progress, 0) >= 100)::int AS completed,
      COUNT(*) FILTER (WHERE wl.status IN ('Continue', 'Carry Over'))::int AS carried,
      ROUND(AVG(COALESCE(wl.progress, 0))::numeric, 1) AS avg_progress
    FROM work_logs wl
    WHERE wl.log_date >= p_start AND wl.log_date <= p_end
      AND (
        (v_eid IS NOT NULL AND wl.employee_id = v_eid)
        OR (v_name IS NOT NULL AND wl.name = v_name)
      )
      AND (v_store IS NULL OR wl.store = v_store OR wl.store IS NULL)
    GROUP BY wl.log_date
    ORDER BY wl.log_date
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.log_date), '[]'::jsonb)
  INTO v_attendance
  FROM (
    SELECT
      al.log_date::text AS log_date,
      COUNT(*) FILTER (WHERE al.log_type ILIKE '%in%' OR al.log_type ILIKE '%출%')::int AS clock_in_count,
      COUNT(*) FILTER (WHERE al.log_type ILIKE '%out%' OR al.log_type ILIKE '%퇴%')::int AS clock_out_count,
      COALESCE(SUM(al.ot_min), 0)::int AS ot_min_sum
    FROM attendance_logs al
    WHERE al.log_date >= p_start AND al.log_date <= p_end
      AND (
        (v_eid IS NOT NULL AND al.employee_id = v_eid)
        OR (v_name IS NOT NULL AND al.name = v_name)
      )
      AND (v_store IS NULL OR al.store_name = v_store)
    GROUP BY al.log_date
    ORDER BY al.log_date
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.eval_date DESC), '[]'::jsonb)
  INTO v_eval
  FROM (
    SELECT
      er.eval_date::text AS eval_date,
      er.eval_type,
      er.final_grade,
      er.store_name,
      er.evaluator
    FROM evaluation_results er
    WHERE er.eval_date >= p_start AND er.eval_date <= p_end
      AND v_name IS NOT NULL AND er.employee_name = v_name
      AND (v_store IS NULL OR er.store_name = v_store)
    ORDER BY er.eval_date DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'employeeName', v_name,
    'employeeStore', v_store,
    'work', COALESCE(v_work, '[]'::jsonb),
    'attendance', COALESCE(v_attendance, '[]'::jsonb),
    'evaluations', COALESCE(v_eval, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION get_work_log_period_summary IS 'Daily work log rollup for one employee over a date range';
COMMENT ON FUNCTION get_work_log_employee_insights IS 'Work log + attendance + evaluation cross-view for HR insights tab';
