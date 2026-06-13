-- 인테리어 대시보드·프로젝트별 알림 집계 (방콕 일자 기준)
-- Supabase SQL Editor에서 실행 후 getInteriorDashboardSummary API가 RPC를 우선 사용합니다.

CREATE OR REPLACE FUNCTION get_interior_dashboard_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH today AS (
  SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date AS d
),
projects AS (
  SELECT
    id,
    code,
    name,
    COALESCE(status, 'active') AS status,
    COALESCE(budget_total, 0)::numeric AS budget_total
  FROM interior_projects
),
wp_projects AS (
  SELECT DISTINCT project_id FROM interior_work_packages
),
wp_late AS (
  SELECT wp.project_id, COUNT(*)::int AS cnt
  FROM interior_work_packages wp
  CROSS JOIN today t
  WHERE COALESCE(wp.status, 'planned') NOT IN ('done', 'cancelled')
    AND wp.end_date IS NOT NULL
    AND wp.end_date < t.d
  GROUP BY wp.project_id
),
legacy_late AS (
  SELECT si.project_id, COUNT(*)::int AS cnt
  FROM interior_schedule_items si
  CROSS JOIN today t
  WHERE NOT EXISTS (
    SELECT 1 FROM wp_projects wp WHERE wp.project_id = si.project_id
  )
    AND si.end_date IS NOT NULL
    AND si.end_date < t.d
  GROUP BY si.project_id
),
schedule_late AS (
  SELECT project_id, SUM(cnt)::int AS cnt
  FROM (
    SELECT project_id, cnt FROM wp_late
    UNION ALL
    SELECT project_id, cnt FROM legacy_late
  ) x
  GROUP BY project_id
),
vt_late AS (
  SELECT v.project_id, COUNT(*)::int AS cnt
  FROM interior_vendor_tracks v
  CROSS JOIN today t
  WHERE COALESCE(v.status, 'planned') NOT IN ('done', 'cancelled')
    AND (
      (v.payment_due_date IS NOT NULL AND v.payment_paid_date IS NULL AND v.payment_due_date < t.d)
      OR (v.material_eta_date IS NOT NULL AND v.material_received_date IS NULL AND v.material_eta_date < t.d)
      OR (
        v.work_completed_date IS NOT NULL
        AND COALESCE(v.status, 'planned') <> 'done'
        AND v.work_completed_date < t.d
      )
    )
  GROUP BY v.project_id
),
paid AS (
  SELECT project_id, COALESCE(SUM(paid), 0)::numeric AS paid_total
  FROM interior_expense_items
  GROUP BY project_id
),
project_rows AS (
  SELECT
    p.id,
    COALESCE(paid.paid_total, 0) AS paid_total,
    COALESCE(schedule_late.cnt, 0) AS schedule_late_count,
    COALESCE(vt_late.cnt, 0) AS vendor_delayed_count,
    (
      p.budget_total > 0
      AND COALESCE(paid.paid_total, 0) > p.budget_total
    ) AS over_budget,
    (
      COALESCE(schedule_late.cnt, 0) > 0
      OR COALESCE(vt_late.cnt, 0) > 0
      OR (
        p.budget_total > 0
        AND COALESCE(paid.paid_total, 0) > p.budget_total
      )
    ) AS has_alert
  FROM projects p
  LEFT JOIN paid ON paid.project_id = p.id
  LEFT JOIN schedule_late ON schedule_late.project_id = p.id
  LEFT JOIN vt_late ON vt_late.project_id = p.id
)
SELECT jsonb_build_object(
  'generatedAt', (SELECT d::text FROM today),
  'totals', jsonb_build_object(
    'activeProjectCount', (
      SELECT COUNT(*)::int FROM projects WHERE status <> 'completed'
    ),
    'scheduleOverdueCount', COALESCE((SELECT SUM(schedule_late_count) FROM project_rows), 0),
    'vendorDelayedCount', COALESCE((SELECT SUM(vendor_delayed_count) FROM project_rows), 0),
    'overBudgetProjectCount', (
      SELECT COUNT(*)::int FROM project_rows WHERE over_budget
    ),
    'projectsWithAnyAlert', (
      SELECT COUNT(*)::int FROM project_rows WHERE has_alert
    )
  ),
  'projects', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'paidTotal', paid_total,
          'scheduleLateCount', schedule_late_count,
          'vendorDelayedCount', vendor_delayed_count,
          'overBudget', over_budget,
          'hasAlert', has_alert
        )
        ORDER BY id
      )
      FROM project_rows
    ),
    '[]'::jsonb
  )
);
$$;
