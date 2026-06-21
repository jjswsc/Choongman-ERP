-- Petty cash 기간 합계 RPC (페이지·2,000건 limit 없이 DB 집계)
-- Supabase SQL Editor에서 1회 실행. 미배포 시 API가 클라이언트 집계 fallback.
-- invoice_received / vat_amount 컬럼: petty_cash_invoice_vat.sql 선행

CREATE OR REPLACE FUNCTION public.get_petty_cash_summary(
  p_start_date date,
  p_end_date date,
  p_effective_store text DEFAULT NULL,
  p_trans_type text DEFAULT NULL,
  p_account_subject_id integer DEFAULT NULL,
  p_account_subject_empty boolean DEFAULT false,
  p_memo_keyword text DEFAULT NULL,
  p_invoice_status text DEFAULT NULL,
  p_pp30_vat_only boolean DEFAULT false
)
RETURNS TABLE (
  expense_total numeric,
  inflow_total numeric,
  net_change numeric,
  vat_total numeric,
  vat_pending_total numeric,
  vat_pending_count bigint,
  row_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.trans_type,
      t.amount,
      COALESCE(t.vat_amount, 0)::numeric AS vat_amount,
      COALESCE(t.invoice_received, false) AS invoice_received
    FROM public.petty_cash_transactions t
    WHERE t.trans_date::date >= p_start_date
      AND t.trans_date::date <= p_end_date
      AND COALESCE(btrim(t.store), '') <> ''
      AND (
        p_effective_store IS NULL
        OR btrim(p_effective_store) = ''
        OR (
          btrim(p_effective_store) = 'Office'
          AND (
            t.store IN ('Office', '본사', '오피스', '본점')
            OR t.store ILIKE 'Office-%'
          )
        )
        OR t.store = btrim(p_effective_store)
      )
      AND (
        p_trans_type IS NULL
        OR btrim(p_trans_type) = ''
        OR lower(t.trans_type) = lower(btrim(p_trans_type))
      )
      AND (
        NOT COALESCE(p_account_subject_empty, false)
        OR t.account_subject_id IS NULL
        OR t.account_subject_id = 0
      )
      AND (
        p_account_subject_id IS NULL
        OR p_account_subject_id = 0
        OR t.account_subject_id = p_account_subject_id
      )
      AND (
        p_memo_keyword IS NULL
        OR btrim(p_memo_keyword) = ''
        OR t.memo ILIKE ('%' || btrim(p_memo_keyword) || '%')
        OR t.user_name ILIKE ('%' || btrim(p_memo_keyword) || '%')
      )
      AND (
        p_invoice_status IS NULL
        OR btrim(p_invoice_status) = ''
        OR btrim(p_invoice_status) = 'all'
        OR (
          lower(t.trans_type) = 'expense'
          AND (
            (btrim(p_invoice_status) = 'received' AND COALESCE(t.invoice_received, false))
            OR (btrim(p_invoice_status) = 'pending' AND NOT COALESCE(t.invoice_received, false))
          )
        )
      )
      AND (
        NOT COALESCE(p_pp30_vat_only, false)
        OR (
          lower(t.trans_type) = 'expense'
          AND COALESCE(t.vat_amount, 0) > 0
        )
      )
  )
  SELECT
    COALESCE(SUM(CASE WHEN lower(trans_type) = 'expense' THEN ABS(amount) ELSE 0 END), 0)::numeric AS expense_total,
    COALESCE(SUM(CASE WHEN lower(trans_type) IN ('receive', 'replenish') THEN ABS(amount) ELSE 0 END), 0)::numeric AS inflow_total,
    COALESCE(SUM(amount), 0)::numeric AS net_change,
    COALESCE(SUM(CASE WHEN lower(trans_type) = 'expense' AND vat_amount > 0 THEN vat_amount ELSE 0 END), 0)::numeric AS vat_total,
    COALESCE(SUM(CASE WHEN lower(trans_type) = 'expense' AND vat_amount > 0 AND NOT invoice_received THEN vat_amount ELSE 0 END), 0)::numeric AS vat_pending_total,
    COUNT(*) FILTER (
      WHERE lower(trans_type) = 'expense' AND vat_amount > 0 AND NOT invoice_received
    )::bigint AS vat_pending_count,
    COUNT(*)::bigint AS row_count
  FROM base;
$$;

COMMENT ON FUNCTION public.get_petty_cash_summary(date, date, text, text, integer, boolean, text, text, boolean) IS
  'Petty cash 기간 합계(지출·입금·VAT·건수). 관리자 검색 합계 카드용.';

REVOKE ALL ON FUNCTION public.get_petty_cash_summary(date, date, text, text, integer, boolean, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_petty_cash_summary(date, date, text, text, integer, boolean, text, text, boolean)
  TO service_role;
