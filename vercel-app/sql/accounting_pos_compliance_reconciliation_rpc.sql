-- POS 결제완료 합계 vs VAT draft 합계 비교용 RPC

CREATE OR REPLACE FUNCTION public.get_pos_paid_totals_by_window(
  p_start_utc TIMESTAMPTZ,
  p_end_utc_exclusive TIMESTAMPTZ,
  p_store_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_count BIGINT,
  subtotal NUMERIC,
  vat NUMERIC,
  total NUMERIC
)
LANGUAGE sql
AS $$
SELECT
  COUNT(*)::BIGINT AS order_count,
  COALESCE(SUM(COALESCE(o.subtotal, 0)), 0)::NUMERIC AS subtotal,
  COALESCE(SUM(COALESCE(o.vat, 0)), 0)::NUMERIC AS vat,
  COALESCE(SUM(COALESCE(o.total, 0)), 0)::NUMERIC AS total
FROM public.pos_orders o
WHERE o.created_at >= p_start_utc
  AND o.created_at < p_end_utc_exclusive
  AND lower(COALESCE(o.status, '')) IN ('paid', 'completed', 'ready')
  AND (
    COALESCE(NULLIF(trim(p_store_code), ''), '*') = '*'
    OR COALESCE(o.store_code, '') = trim(p_store_code)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_vat_draft_totals_by_window(
  p_start_date DATE,
  p_end_date DATE,
  p_store_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  row_count BIGINT,
  net_amount NUMERIC,
  vat_amount NUMERIC,
  total_amount NUMERIC
)
LANGUAGE sql
AS $$
SELECT
  COUNT(*)::BIGINT AS row_count,
  COALESCE(SUM(COALESCE(v.net_amount, 0)), 0)::NUMERIC AS net_amount,
  COALESCE(SUM(COALESCE(v.vat_amount, 0)), 0)::NUMERIC AS vat_amount,
  COALESCE(SUM(COALESCE(v.total_amount, 0)), 0)::NUMERIC AS total_amount
FROM public.vat_ledger_entries v
WHERE v.doc_date >= p_start_date
  AND v.doc_date <= p_end_date
  AND lower(COALESCE(v.direction, '')) = 'output'
  AND lower(COALESCE(v.filing_status, 'draft')) = 'draft'
  AND (
    COALESCE(NULLIF(trim(p_store_name), ''), '*') = '*'
    OR COALESCE(v.store_name, '') = trim(p_store_name)
  );
$$;
