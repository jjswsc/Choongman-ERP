-- POS 기간 매출 요약 RPC (완료/대기 건수·합계·현금)
-- Supabase SQL Editor에서 실행. 미배포 시 getPosTodaySales 는 기존 select 경로만 사용합니다.
-- 본문 정의: vercel-app/sql/pos_hardening_phase2.sql (섹션 get_pos_sales_period_summary)

CREATE OR REPLACE FUNCTION public.get_pos_sales_period_summary(
  p_start_utc TIMESTAMPTZ,
  p_end_utc_exclusive TIMESTAMPTZ,
  p_store_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  completed_count BIGINT,
  completed_total NUMERIC,
  completed_cash NUMERIC,
  pending_count BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_has_total boolean;
  v_has_total_amount boolean;
  v_has_payment_cash boolean;
  v_has_store_code boolean;
  v_has_store_name boolean;
  v_has_status boolean;
  v_has_payload boolean;
  v_total_expr text;
  v_cash_expr text;
  v_store_expr text;
  v_status_expr text;
  v_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'total'
  ) INTO v_has_total;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'total_amount'
  ) INTO v_has_total_amount;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'payment_cash'
  ) INTO v_has_payment_cash;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_code'
  ) INTO v_has_store_code;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_name'
  ) INTO v_has_store_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'status'
  ) INTO v_has_status;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'payload'
  ) INTO v_has_payload;

  IF v_has_total THEN
    v_total_expr := 'COALESCE(o.total, 0)';
  ELSIF v_has_total_amount THEN
    v_total_expr := 'COALESCE(o.total_amount, 0)';
  ELSIF v_has_payload THEN
    v_total_expr := 'COALESCE((o.payload->>''total'')::numeric, (o.payload->>''totalAmount'')::numeric, 0)';
  ELSE
    v_total_expr := '0';
  END IF;

  IF v_has_payment_cash THEN
    v_cash_expr := 'COALESCE(o.payment_cash, 0)';
  ELSIF v_has_payload THEN
    v_cash_expr := 'COALESCE((o.payload->>''paymentCash'')::numeric, (o.payload->>''payment_cash'')::numeric, 0)';
  ELSE
    v_cash_expr := '0';
  END IF;

  IF v_has_store_code THEN
    v_store_expr := 'COALESCE(o.store_code, '''')';
  ELSIF v_has_store_name THEN
    v_store_expr := 'COALESCE(o.store_name, '''')';
  ELSIF v_has_payload THEN
    v_store_expr := 'COALESCE((o.payload->>''storeCode''), (o.payload->>''store_code''), '''')';
  ELSE
    v_store_expr := '''''';
  END IF;

  IF v_has_status THEN
    v_status_expr := 'LOWER(COALESCE(o.status, ''''))';
  ELSIF v_has_payload THEN
    v_status_expr := 'LOWER(COALESCE((o.payload->>''status''), ''''))';
  ELSE
    v_status_expr := '''''';
  END IF;

  v_sql := '
    WITH base AS (
      SELECT
        ' || v_status_expr || ' AS status,
        (' || v_total_expr || ')::numeric AS total,
        (' || v_cash_expr || ')::numeric AS payment_cash
      FROM public.pos_orders o
      WHERE o.created_at >= $1
        AND o.created_at < $2
        AND (
          $3 IS NULL
          OR COALESCE(array_length($3, 1), 0) = 0
          OR (' || v_store_expr || ') = ANY ($3)
        )
    )
    SELECT
      COUNT(*) FILTER (WHERE status IN (''completed'', ''paid'', ''ready''))::bigint AS completed_count,
      COALESCE(SUM(total) FILTER (WHERE status IN (''completed'', ''paid'', ''ready'')), 0)::numeric AS completed_total,
      COALESCE(SUM(payment_cash) FILTER (WHERE status IN (''completed'', ''paid'', ''ready'')), 0)::numeric AS completed_cash,
      COUNT(*) FILTER (WHERE status IN (''pending'', ''cooking''))::bigint AS pending_count
    FROM base
  ';

  RETURN QUERY EXECUTE v_sql USING p_start_utc, p_end_utc_exclusive, p_store_codes;
END;
$$;

COMMENT ON FUNCTION public.get_pos_sales_period_summary(timestamptz, timestamptz, text[]) IS
  'POS 매출 요약: 완료/대기 건수·합계·현금. getPosTodaySales RPC 경로(단일 매장·단일 영업일)용.';

GRANT EXECUTE ON FUNCTION public.get_pos_sales_period_summary(timestamptz, timestamptz, text[]) TO anon, authenticated, service_role;
