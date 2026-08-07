-- 협업 할인 사용 — 매장별·일별 집계 RPC (누적·집계 → DB GROUP BY)
-- Supabase SQL Editor에서 실행. 선행: pos_orders_collab_discount_amt.sql
-- 기존 get_collab_discount_usage 와 동일 필터(완료 주문·할인액>0·방콕 일자)

CREATE OR REPLACE FUNCTION get_collab_discount_usage_by_store(
  p_start_ymd text,
  p_end_ymd text,
  p_store_code text DEFAULT NULL,
  p_campaign_id bigint DEFAULT NULL
)
RETURNS TABLE (
  store_code text,
  order_count bigint,
  discount_amount numeric,
  campaign_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    NULLIF(TRIM(o.store_code), '') AS store_code,
    COUNT(*)::bigint AS order_count,
    ROUND(SUM(COALESCE(o.collab_discount_amt, 0))::numeric, 2) AS discount_amount,
    COUNT(DISTINCT o.marketing_campaign_id)::bigint AS campaign_count
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
  GROUP BY NULLIF(TRIM(o.store_code), '')
  HAVING NULLIF(TRIM(o.store_code), '') IS NOT NULL
  ORDER BY discount_amount DESC, order_count DESC;
$$;

CREATE OR REPLACE FUNCTION get_collab_discount_usage_daily(
  p_start_ymd text,
  p_end_ymd text,
  p_store_code text DEFAULT NULL,
  p_campaign_id bigint DEFAULT NULL
)
RETURNS TABLE (
  usage_ymd text,
  order_count bigint,
  discount_amount numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_char((o.created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD') AS usage_ymd,
    COUNT(*)::bigint AS order_count,
    ROUND(SUM(COALESCE(o.collab_discount_amt, 0))::numeric, 2) AS discount_amount
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
  GROUP BY to_char((o.created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD')
  ORDER BY usage_ymd ASC;
$$;

GRANT EXECUTE ON FUNCTION get_collab_discount_usage_by_store(text, text, text, bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_collab_discount_usage_daily(text, text, text, bigint) TO anon, authenticated, service_role;
