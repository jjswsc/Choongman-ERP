-- 본사 창고 일별 입출고 매트릭스 — stock_logs 집계 RPC (미배포 시 JS fallback)
-- Supabase SQL Editor에서 실행

CREATE OR REPLACE FUNCTION get_hq_warehouse_stock_movement_agg(
  p_location_patterns text[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  bangkok_ymd text,
  log_type text,
  vendor_target text,
  item_code text,
  qty_sum double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_char((sl.log_date AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS bangkok_ymd,
    sl.log_type::text,
    COALESCE(sl.vendor_target, '')::text AS vendor_target,
    sl.item_code::text,
    SUM(sl.qty)::double precision AS qty_sum
  FROM stock_logs sl
  WHERE sl.log_date >= p_start
    AND sl.log_date < p_end
    AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
    AND sl.log_type IN ('Inbound', 'Outbound', 'ForceOutbound', 'Adjustment')
    AND EXISTS (
      SELECT 1
      FROM unnest(p_location_patterns) AS pat
      WHERE sl.location ILIKE pat
    )
  GROUP BY 1, 2, 3, 4;
$$;

COMMENT ON FUNCTION get_hq_warehouse_stock_movement_agg IS
  'HQ warehouse daily matrix — aggregated movement qty by Bangkok day, type, store target, item';
