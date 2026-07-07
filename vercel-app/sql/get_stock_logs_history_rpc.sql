-- =============================================================================
-- 사용·재고조정 이력 RPC (Supabase SQL Editor에서 실행)
-- 앱: getMyUsageHistory / getAdjustmentHistory — RPC 우선, 미배포 시 PostgREST fallback
-- =============================================================================

-- 권장 인덱스 (CONCURRENTLY 는 트랜잭션 밖에서 실행)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_logs_type_location_log_date
--   ON public.stock_logs (log_type, location, log_date DESC);

-- 1) 매장 사용(Usage) 이력 — 방콕 달력 기간, items·employees 조인
CREATE OR REPLACE FUNCTION public.get_stock_logs_usage_history(
  p_store text,
  p_start timestamptz,
  p_end_exclusive timestamptz,
  p_limit int DEFAULT 50000,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  date text,
  date_time text,
  item text,
  item_code text,
  category text,
  qty numeric,
  amount numeric,
  user_name text,
  user_nick text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char((sl.log_date AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD') AS date,
    to_char((sl.log_date AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD HH24:MI') AS date_time,
    COALESCE(btrim(sl.item_name), '')::text AS item,
    COALESCE(btrim(sl.item_code), '')::text AS item_code,
    COALESCE(btrim(i.category), '')::text AS category,
    ABS(sl.qty)::numeric AS qty,
    (ABS(sl.qty) * COALESCE(i.price, 0))::numeric AS amount,
    NULLIF(btrim(sl.user_name), '')::text AS user_name,
    COALESCE(NULLIF(btrim(e.nick), ''), NULLIF(btrim(sl.user_name), ''))::text AS user_nick
  FROM public.stock_logs sl
  LEFT JOIN public.items i ON i.code = sl.item_code
  LEFT JOIN public.employees e
    ON btrim(COALESCE(e.store, '')) ILIKE btrim(COALESCE(p_store, ''))
    AND btrim(COALESCE(e.name, '')) = btrim(COALESCE(sl.user_name, ''))
  WHERE sl.log_type = 'Usage'
    AND btrim(COALESCE(p_store, '')) <> ''
    AND sl.location ILIKE p_store
    AND sl.log_date >= p_start
    AND sl.log_date < p_end_exclusive
  ORDER BY sl.log_date DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 50000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- 2) 재고 조정(Adjustment) 이력 — p_store_filter NULL/''/'all' 이면 전 매장
CREATE OR REPLACE FUNCTION public.get_stock_logs_adjustment_history(
  p_store_filter text,
  p_start timestamptz,
  p_end_exclusive timestamptz,
  p_limit int DEFAULT 50000,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  date text,
  store text,
  item text,
  item_code text,
  category text,
  spec text,
  diff numeric,
  vendor_target text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char((sl.log_date AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD') AS date,
    COALESCE(btrim(sl.location), '')::text AS store,
    COALESCE(btrim(sl.item_name), '-')::text AS item,
    COALESCE(btrim(sl.item_code), '')::text AS item_code,
    COALESCE(btrim(i.category), '')::text AS category,
    COALESCE(NULLIF(btrim(i.spec), ''), '-')::text AS spec,
    COALESCE(sl.qty, 0)::numeric AS diff,
    COALESCE(btrim(sl.vendor_target), '')::text AS vendor_target
  FROM public.stock_logs sl
  LEFT JOIN public.items i ON i.code = sl.item_code
  WHERE sl.log_type = 'Adjustment'
    AND sl.log_date >= p_start
    AND sl.log_date < p_end_exclusive
    AND (
      p_store_filter IS NULL
      OR btrim(p_store_filter) = ''
      OR lower(btrim(p_store_filter)) = 'all'
      OR sl.location ILIKE p_store_filter
    )
  ORDER BY sl.log_date DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 50000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.get_stock_logs_usage_history(text, timestamptz, timestamptz, int, int) IS
  '매장 Usage 이력. p_store=location ILIKE. 기간 [p_start, p_end_exclusive) UTC.';
COMMENT ON FUNCTION public.get_stock_logs_adjustment_history(text, timestamptz, timestamptz, int, int) IS
  'Adjustment 이력. p_store_filter all/NULL=전체. vendor_target은 앱에서 표시명 변환.';

REVOKE ALL ON FUNCTION public.get_stock_logs_usage_history(text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stock_logs_adjustment_history(text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_logs_usage_history(text, timestamptz, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_logs_adjustment_history(text, timestamptz, timestamptz, int, int) TO service_role;
