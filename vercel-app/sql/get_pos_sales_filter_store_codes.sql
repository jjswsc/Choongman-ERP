-- 매출 관리 매장 필터: 기간 내 pos_orders.store_code 전부 (DISTINCT).
-- Supabase SQL Editor에서 실행 후 /api/posSalesFilterOptions 가 RPC를 우선 사용합니다.

CREATE OR REPLACE FUNCTION public.get_pos_sales_filter_store_codes(
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz
)
RETURNS TABLE (store_code text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT btrim(COALESCE(o.store_code, ''))::text AS store_code
  FROM public.pos_orders o
  WHERE o.created_at >= p_start_utc
    AND o.created_at < p_end_utc_exclusive
    AND COALESCE(btrim(o.store_code), '') <> ''
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.get_pos_sales_filter_store_codes(timestamptz, timestamptz) IS
  '매출 관리 매장 필터: pos_orders UTC 구간 내 DISTINCT store_code (앱 posSalesFilterOptions).';

GRANT EXECUTE ON FUNCTION public.get_pos_sales_filter_store_codes(timestamptz, timestamptz) TO anon, authenticated, service_role;
