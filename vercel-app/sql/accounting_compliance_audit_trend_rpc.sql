-- 감사로그 월별 추세 집계(RPC)
CREATE OR REPLACE FUNCTION public.get_accounting_compliance_audit_trend(
  p_base_year_month TEXT,
  p_months INTEGER DEFAULT 3,
  p_store_scope TEXT DEFAULT 'All',
  p_period_type TEXT DEFAULT '',
  p_decision TEXT DEFAULT '',
  p_action_keyword TEXT DEFAULT ''
)
RETURNS TABLE (
  year_month TEXT,
  total BIGINT,
  allow_count BIGINT,
  deny_count BIGINT,
  error_count BIGINT,
  deny_rate NUMERIC,
  error_rate NUMERIC
)
LANGUAGE sql
AS $$
WITH base AS (
  SELECT CASE
    WHEN p_base_year_month ~ '^\d{4}-\d{2}$' THEN to_date(p_base_year_month || '-01', 'YYYY-MM-DD')
    ELSE date_trunc('month', now())::date
  END AS base_month
),
months AS (
  SELECT to_char((base.base_month - (gs.n || ' month')::interval)::date, 'YYYY-MM') AS ym
  FROM base
  CROSS JOIN generate_series(0, GREATEST(COALESCE(p_months, 3), 1) - 1) AS gs(n)
),
filtered AS (
  SELECT
    a.year_month,
    a.decision
  FROM public.accounting_compliance_audit_logs a
  JOIN months m ON m.ym = a.year_month
  WHERE
    (
      COALESCE(NULLIF(trim(p_store_scope), ''), 'All') = 'All'
      OR COALESCE(a.store_scope, '') IN ('', 'All', trim(p_store_scope))
    )
    AND (
      COALESCE(NULLIF(trim(p_period_type), ''), '') = ''
      OR a.period_type = trim(p_period_type)
    )
    AND (
      COALESCE(NULLIF(trim(p_decision), ''), '') = ''
      OR a.decision = trim(p_decision)
    )
    AND (
      COALESCE(NULLIF(trim(p_action_keyword), ''), '') = ''
      OR COALESCE(a.action_type, '') ILIKE '%' || trim(p_action_keyword) || '%'
      OR COALESCE(a.reason_code, '') ILIKE '%' || trim(p_action_keyword) || '%'
    )
),
agg AS (
  SELECT
    f.year_month,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE f.decision = 'allow')::BIGINT AS allow_count,
    COUNT(*) FILTER (WHERE f.decision = 'deny')::BIGINT AS deny_count,
    COUNT(*) FILTER (WHERE f.decision = 'error')::BIGINT AS error_count
  FROM filtered f
  GROUP BY f.year_month
)
SELECT
  m.ym AS year_month,
  COALESCE(a.total, 0)::BIGINT AS total,
  COALESCE(a.allow_count, 0)::BIGINT AS allow_count,
  COALESCE(a.deny_count, 0)::BIGINT AS deny_count,
  COALESCE(a.error_count, 0)::BIGINT AS error_count,
  CASE WHEN COALESCE(a.total, 0) > 0 THEN ROUND((a.deny_count::NUMERIC / a.total::NUMERIC) * 100, 1) ELSE 0 END AS deny_rate,
  CASE WHEN COALESCE(a.total, 0) > 0 THEN ROUND((a.error_count::NUMERIC / a.total::NUMERIC) * 100, 1) ELSE 0 END AS error_rate
FROM months m
LEFT JOIN agg a ON a.year_month = m.ym
ORDER BY m.ym DESC;
$$;
