-- 일일 업무표 시간 분석 — 기간 내 항목을 직급·카테고리·항목명별로 집계
-- 방문(source=visit) 항목은 매장 체류시간이라 합계에서 제외.

CREATE OR REPLACE FUNCTION get_daily_plan_time_summary(p_start date, p_end date, p_stores text[] DEFAULT NULL)
RETURNS TABLE (
  role_scope text,
  category text,
  title text,
  item_count bigint,
  done_count bigint,
  skipped_count bigint,
  est_sum bigint,
  actual_sum bigint,
  actual_done_est_sum bigint,
  overrun_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.role_scope,
    i.category,
    i.title,
    count(*) AS item_count,
    count(*) FILTER (WHERE i.status = 'done') AS done_count,
    count(*) FILTER (WHERE i.status = 'skipped') AS skipped_count,
    coalesce(sum(i.est_minutes), 0) AS est_sum,
    coalesce(sum(i.actual_minutes) FILTER (WHERE i.status = 'done'), 0) AS actual_sum,
    coalesce(sum(i.est_minutes) FILTER (WHERE i.status = 'done'), 0) AS actual_done_est_sum,
    count(*) FILTER (WHERE i.status = 'done' AND i.actual_minutes > i.est_minutes) AS overrun_count
  FROM daily_plan_items i
  JOIN daily_plans p ON p.id = i.plan_id
  WHERE p.plan_date BETWEEN p_start AND p_end
    AND i.source <> 'visit'
    AND (p_stores IS NULL OR p.store_name = ANY (p_stores))
  GROUP BY p.role_scope, i.category, i.title;
$$;
