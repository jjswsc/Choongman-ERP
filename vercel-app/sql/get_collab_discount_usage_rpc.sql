-- 협업 할인 사용 현황 집계 RPC (누적·집계 → DB GROUP BY)
-- Supabase SQL Editor에서 실행. 선행: pos_orders_collab_discount_amt.sql

CREATE OR REPLACE FUNCTION get_collab_discount_usage(
  p_start_ymd text,
  p_end_ymd text,
  p_store_code text DEFAULT NULL,
  p_campaign_id bigint DEFAULT NULL
)
RETURNS TABLE (
  campaign_id bigint,
  order_count bigint,
  discount_amount numeric,
  store_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.marketing_campaign_id AS campaign_id,
    COUNT(*)::bigint AS order_count,
    ROUND(SUM(COALESCE(o.collab_discount_amt, 0))::numeric, 2) AS discount_amount,
    COUNT(DISTINCT NULLIF(TRIM(o.store_code), ''))::bigint AS store_count
  FROM public.pos_orders o
  WHERE o.marketing_campaign_id IS NOT NULL
    AND COALESCE(o.collab_discount_amt, 0) > 0
    AND o.status IN ('completed', 'paid', 'ready')
    AND o.created_at >= (p_start_ymd || 'T00:00:00+07:00')::timestamptz
    AND o.created_at < ((p_end_ymd::date + 1)::text || 'T00:00:00+07:00')::timestamptz
    AND (
      p_store_code IS NULL
      OR TRIM(p_store_code) = ''
      OR o.store_code = TRIM(p_store_code)
    )
    AND (
      p_campaign_id IS NULL
      OR p_campaign_id <= 0
      OR o.marketing_campaign_id = p_campaign_id
    )
  GROUP BY o.marketing_campaign_id
  ORDER BY discount_amount DESC, order_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_collab_discount_usage(text, text, text, bigint) TO anon, authenticated, service_role;
