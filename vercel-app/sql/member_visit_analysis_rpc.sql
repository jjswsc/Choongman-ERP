-- 회원 방문 분석 RPC (누적·집계 → DB 집계)
-- Supabase SQL Editor에서 실행

CREATE OR REPLACE FUNCTION get_member_visit_analysis(
  p_start_ymd text,
  p_end_ymd text,
  p_store_code text DEFAULT NULL,
  p_member_id bigint DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 500
)
RETURNS TABLE (
  member_id bigint,
  member_no text,
  member_name text,
  visit_count bigint,
  avg_visit_cycle_days numeric,
  avg_ticket_amount numeric,
  total_contribution numeric,
  last_visited_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH orders AS (
    SELECT
      o.member_id,
      o.member_no,
      o.total,
      o.created_at
    FROM pos_orders o
    WHERE o.member_id IS NOT NULL
      AND o.member_id > 0
      AND o.created_at >= (p_start_ymd || 'T00:00:00+07:00')::timestamptz
      AND o.created_at <= (p_end_ymd || 'T23:59:59+07:00')::timestamptz
      AND (p_store_code IS NULL OR p_store_code = '' OR o.store_code = p_store_code)
      AND (p_member_id IS NULL OR p_member_id <= 0 OR o.member_id = p_member_id)
  ),
  agg AS (
    SELECT
      o.member_id,
      MAX(o.member_no) AS member_no,
      COUNT(*)::bigint AS visit_count,
      SUM(COALESCE(o.total, 0))::numeric AS total_contribution,
      MAX(o.created_at) AS last_visited_at
    FROM orders o
    GROUP BY o.member_id
  ),
  gaps AS (
    SELECT
      og.member_id,
      AVG(og.gap_days) AS avg_cycle
    FROM (
      SELECT
        o.member_id,
        EXTRACT(EPOCH FROM (o.created_at - LAG(o.created_at) OVER (PARTITION BY o.member_id ORDER BY o.created_at ASC))) / 86400.0 AS gap_days
      FROM orders o
    ) og
    WHERE og.gap_days IS NOT NULL AND og.gap_days >= 0
    GROUP BY og.member_id
  )
  SELECT
    a.member_id,
    COALESCE(a.member_no, '') AS member_no,
    COALESCE(m.name, '') AS member_name,
    a.visit_count,
    ROUND(g.avg_cycle::numeric, 1) AS avg_visit_cycle_days,
    CASE WHEN a.visit_count > 0 THEN ROUND(a.total_contribution / a.visit_count, 2) ELSE 0 END AS avg_ticket_amount,
    a.total_contribution,
    a.last_visited_at
  FROM agg a
  LEFT JOIN gaps g ON g.member_id = a.member_id
  LEFT JOIN members m ON m.id = a.member_id
  WHERE (
    p_q IS NULL OR p_q = ''
    OR COALESCE(m.name, '') ILIKE '%' || p_q || '%'
    OR COALESCE(a.member_no, '') ILIKE '%' || p_q || '%'
    OR COALESCE(m.phone, '') ILIKE '%' || p_q || '%'
  )
  ORDER BY a.total_contribution DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
$$;
