-- =============================================================================
-- 모바일 주문 이력 RPC (Supabase SQL Editor에서 실행)
-- 앱: getMyOrderHistory — orders + ForcePush 병합은 JS, DB는 기간·매장 필터만
-- =============================================================================

-- 1) 발주(orders) 이력 — 기간 내 전건 (앱에서 cart_json·페이지네이션 처리)
CREATE OR REPLACE FUNCTION public.get_my_order_history_orders(
  p_store text,
  p_start timestamptz,
  p_end_exclusive timestamptz,
  p_limit int DEFAULT 50000,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  order_date timestamptz,
  delivery_date text,
  delivery_dates_by_outbound text,
  cart_json text,
  total numeric,
  status text,
  delivery_status text,
  received_indices text,
  received_qty_json text,
  original_order_qty_json text,
  user_name text,
  reject_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id::bigint,
    o.order_date,
    COALESCE(o.delivery_date::text, '')::text AS delivery_date,
    COALESCE(o.delivery_dates_by_outbound::text, '')::text AS delivery_dates_by_outbound,
    COALESCE(o.cart_json::text, '[]')::text AS cart_json,
    COALESCE(o.total, 0)::numeric AS total,
    COALESCE(o.status, 'Pending')::text AS status,
    COALESCE(o.delivery_status, '')::text AS delivery_status,
    COALESCE(o.received_indices::text, '')::text AS received_indices,
    COALESCE(o.received_qty_json::text, '')::text AS received_qty_json,
    COALESCE(o.original_order_qty_json::text, '')::text AS original_order_qty_json,
    COALESCE(o.user_name, '')::text AS user_name,
    COALESCE(o.reject_reason, '')::text AS reject_reason
  FROM public.orders o
  WHERE btrim(COALESCE(p_store, '')) <> ''
    AND o.store_name ILIKE p_store
    AND o.order_date >= p_start
    AND o.order_date < p_end_exclusive
  ORDER BY o.order_date DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 50000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- 2) 강제출고(ForcePush) stock_logs — getMyOrderHistory 병합용
CREATE OR REPLACE FUNCTION public.get_my_order_history_force_push(
  p_store text,
  p_start timestamptz,
  p_end_exclusive timestamptz,
  p_limit int DEFAULT 50000,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  log_date timestamptz,
  item_code text,
  item_name text,
  qty numeric,
  delivery_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sl.log_date,
    COALESCE(btrim(sl.item_code), '')::text AS item_code,
    COALESCE(btrim(sl.item_name), '')::text AS item_name,
    sl.qty::numeric AS qty,
    COALESCE(btrim(sl.delivery_status), '')::text AS delivery_status
  FROM public.stock_logs sl
  WHERE sl.log_type = 'ForcePush'
    AND btrim(COALESCE(p_store, '')) <> ''
    AND sl.location ILIKE p_store
    AND sl.log_date >= p_start
    AND sl.log_date < p_end_exclusive
  ORDER BY sl.log_date DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 50000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.get_my_order_history_orders(text, timestamptz, timestamptz, int, int) IS
  '모바일 주문 이력 orders. p_store=store_name ILIKE. [p_start,p_end_exclusive) UTC.';
COMMENT ON FUNCTION public.get_my_order_history_force_push(text, timestamptz, timestamptz, int, int) IS
  '모바일 주문 이력 ForcePush stock_logs 병합용.';

REVOKE ALL ON FUNCTION public.get_my_order_history_orders(text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_order_history_force_push(text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_order_history_orders(text, timestamptz, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_order_history_force_push(text, timestamptz, timestamptz, int, int) TO service_role;
