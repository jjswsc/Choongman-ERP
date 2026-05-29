-- =============================================================================
-- Supabase SQL Editor 전용 (앱 배포 불필요)
-- 앱은 RPC 실패 시 기존 PostgREST select fallback — 화면·집계 로직 변경 없음.
-- 배포 후: Query Performance에서 get_store_stock / get_receivable_summary 등 calls 확인.
-- =============================================================================

-- 1) 재고 합계 · location 목록 (accounting-reports, getAppData, getStockStores)
CREATE OR REPLACE FUNCTION public.get_store_stock(
  p_location_patterns text[],
  p_as_of_date timestamptz DEFAULT NULL
)
RETURNS TABLE(item_code text, total_qty numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.item_code::text, SUM(sl.qty)::numeric
  FROM public.stock_logs sl
  WHERE
    (p_as_of_date IS NULL OR sl.log_date <= p_as_of_date)
    AND (
      p_location_patterns IS NULL
      OR cardinality(p_location_patterns) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(p_location_patterns) AS pat
        WHERE sl.location ILIKE pat
      )
    )
  GROUP BY sl.item_code;
$$;

CREATE OR REPLACE FUNCTION public.get_distinct_stock_locations()
RETURNS TABLE(location text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT sl.location::text
  FROM public.stock_logs sl
  WHERE sl.location IS NOT NULL AND btrim(sl.location) <> '';
$$;

-- 2) 미수 · 미지급 요약 (getReceivablePayableSummary)
CREATE OR REPLACE FUNCTION public.get_receivable_summary(
  p_store_filter text DEFAULT NULL,
  p_end_str text DEFAULT NULL
)
RETURNS TABLE(store_name text, balance numeric, item_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.store_name::text,
    SUM(r.amount)::numeric AS balance,
    COUNT(*)::bigint AS item_count
  FROM public.receivable_transactions r
  WHERE
    (p_store_filter IS NULL OR p_store_filter = '' OR r.store_name ILIKE p_store_filter)
    AND (p_end_str IS NULL OR p_end_str = '' OR r.trans_date::date <= p_end_str::date)
  GROUP BY r.store_name;
$$;

CREATE OR REPLACE FUNCTION public.get_payable_summary(
  p_vendor_filter text DEFAULT NULL,
  p_end_str text DEFAULT NULL
)
RETURNS TABLE(vendor_code text, balance numeric, item_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.vendor_code::text,
    SUM(p.amount)::numeric AS balance,
    COUNT(*)::bigint AS item_count
  FROM public.payable_transactions p
  WHERE
    (p_vendor_filter IS NULL OR p_vendor_filter = '' OR p.vendor_code ILIKE p_vendor_filter)
    AND (p_end_str IS NULL OR p_end_str = '' OR p.trans_date::date <= p_end_str::date)
  GROUP BY p.vendor_code;
$$;

-- 3) 매출 관리 매장 필터 DISTINCT (posSalesFilterOptions)
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

COMMENT ON FUNCTION public.get_store_stock(text[], timestamptz) IS
  '매장별 재고 합계. location ILIKE. p_as_of_date 상한(<=).';
COMMENT ON FUNCTION public.get_distinct_stock_locations() IS
  'stock_logs DISTINCT location.';
COMMENT ON FUNCTION public.get_receivable_summary(text, text) IS
  '미수금 store별 잔액 요약.';
COMMENT ON FUNCTION public.get_payable_summary(text, text) IS
  '미지급금 vendor별 잔액 요약.';
COMMENT ON FUNCTION public.get_pos_sales_filter_store_codes(timestamptz, timestamptz) IS
  '매출 관리 매장 필터 DISTINCT store_code.';

GRANT EXECUTE ON FUNCTION public.get_store_stock(text[], timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_distinct_stock_locations() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_receivable_summary(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payable_summary(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pos_sales_filter_store_codes(timestamptz, timestamptz) TO anon, authenticated, service_role;
