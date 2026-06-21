-- stock_logs 매입·출고 금액 집계 (품목·거래처·location 단위 GROUP BY — 손익 매입 한도 회피)
-- Supabase SQL Editor에서 실행

CREATE OR REPLACE FUNCTION public.get_stock_logs_purchase_agg(
  p_log_types text[],
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz,
  p_location_patterns text[] DEFAULT NULL,
  p_vendor_patterns text[] DEFAULT NULL
)
RETURNS TABLE (
  item_code text,
  vendor_target text,
  reference_no text,
  location text,
  line_qty numeric,
  line_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sl.item_code::text,
    COALESCE(NULLIF(trim(sl.vendor_target::text), ''), '')::text AS vendor_target,
    COALESCE(NULLIF(trim(sl.reference_no::text), ''), '')::text AS reference_no,
    COALESCE(NULLIF(trim(sl.location::text), ''), '')::text AS location,
    SUM(ABS(sl.qty))::numeric AS line_qty,
    SUM(
      ABS(sl.qty) * COALESCE(
        sl.invoice_unit_price,
        sl.unit_cost,
        i.cost,
        0::numeric
      )
    )::numeric AS line_amount
  FROM stock_logs sl
  LEFT JOIN items i ON i.code = sl.item_code
  WHERE
    sl.log_type = ANY (p_log_types)
    AND sl.log_date >= p_start_utc
    AND sl.log_date < p_end_utc_exclusive
    AND (
      p_location_patterns IS NULL
      OR cardinality(p_location_patterns) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(p_location_patterns) AS pat
        WHERE sl.location ILIKE pat
      )
    )
    AND (
      p_vendor_patterns IS NULL
      OR cardinality(p_vendor_patterns) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(p_vendor_patterns) AS pat
        WHERE sl.vendor_target ILIKE pat
      )
    )
  GROUP BY
    sl.item_code,
    COALESCE(NULLIF(trim(sl.vendor_target::text), ''), ''),
    COALESCE(NULLIF(trim(sl.reference_no::text), ''), ''),
    COALESCE(NULLIF(trim(sl.location::text), ''), '');
$$;

COMMENT ON FUNCTION public.get_stock_logs_purchase_agg(text[], timestamptz, timestamptz, text[], text[]) IS
  '기간·location·vendor_target 패턴으로 stock_logs 매입/출고 금액을 품목·거래처 단위로 집계';

REVOKE ALL ON FUNCTION public.get_stock_logs_purchase_agg(text[], timestamptz, timestamptz, text[], text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_logs_purchase_agg(text[], timestamptz, timestamptz, text[], text[])
  TO service_role;
