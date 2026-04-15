-- POS 고도화 2차: 프린터 설정 감사로그 + POS 기간집계 RPC
-- Supabase SQL Editor에서 실행 (idempotent)

BEGIN;

-- 1) POS 프린터 설정 감사 로그
CREATE TABLE IF NOT EXISTS public.pos_printer_settings_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NULL,
  changed_role TEXT NULL,
  changed_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_json JSONB NULL,
  after_json JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_printer_settings_audit_logs_store_changed
  ON public.pos_printer_settings_audit_logs(store_code, changed_at DESC);

ALTER TABLE public.pos_printer_settings_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_printer_settings_audit_logs" ON public.pos_printer_settings_audit_logs;
CREATE POLICY "Allow all pos_printer_settings_audit_logs" ON public.pos_printer_settings_audit_logs
  FOR ALL USING (true) WITH CHECK (true);

-- 2) POS 기간 집계용 RPC (앱 메모리 집계 전 단계 행 조회)
CREATE OR REPLACE FUNCTION public.get_pos_sales_period_rows(
  p_start_utc TIMESTAMPTZ,
  p_end_utc_exclusive TIMESTAMPTZ,
  p_store_codes TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 50000
)
RETURNS TABLE (
  created_at TIMESTAMPTZ,
  total NUMERIC,
  subtotal NUMERIC,
  vat NUMERIC,
  discount_amt NUMERIC,
  coupon_discount_amt NUMERIC,
  guest_count INTEGER,
  store_code TEXT,
  status TEXT,
  order_type TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_total boolean;
  v_has_total_amount boolean;
  v_has_subtotal boolean;
  v_has_vat boolean;
  v_has_discount_amt boolean;
  v_has_coupon_discount_amt boolean;
  v_has_guest_count boolean;
  v_has_store_code boolean;
  v_has_store_name boolean;
  v_has_status boolean;
  v_has_order_type boolean;
  v_total_expr text;
  v_subtotal_expr text;
  v_vat_expr text;
  v_discount_expr text;
  v_coupon_discount_expr text;
  v_guest_count_expr text;
  v_store_expr text;
  v_status_expr text;
  v_order_type_expr text;
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
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'subtotal'
  ) INTO v_has_subtotal;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'vat'
  ) INTO v_has_vat;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'discount_amt'
  ) INTO v_has_discount_amt;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'coupon_discount_amt'
  ) INTO v_has_coupon_discount_amt;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'guest_count'
  ) INTO v_has_guest_count;
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
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'order_type'
  ) INTO v_has_order_type;

  v_total_expr := 'COALESCE((o.payload->>''total'')::numeric, (o.payload->>''totalAmount'')::numeric, 0)';
  IF v_has_total THEN
    v_total_expr := 'COALESCE(o.total, ' || v_total_expr || ')';
  ELSIF v_has_total_amount THEN
    v_total_expr := 'COALESCE(o.total_amount, ' || v_total_expr || ')';
  END IF;

  v_subtotal_expr := 'COALESCE((o.payload->>''subtotal'')::numeric, 0)';
  IF v_has_subtotal THEN
    v_subtotal_expr := 'COALESCE(o.subtotal, ' || v_subtotal_expr || ')';
  END IF;

  v_vat_expr := 'COALESCE((o.payload->>''vat'')::numeric, (o.payload->>''vatFeeAmt'')::numeric, 0)';
  IF v_has_vat THEN
    v_vat_expr := 'COALESCE(o.vat, ' || v_vat_expr || ')';
  END IF;

  v_discount_expr := 'COALESCE((o.payload->>''discountAmt'')::numeric, (o.payload->>''discount_amt'')::numeric, 0)';
  IF v_has_discount_amt THEN
    v_discount_expr := 'COALESCE(o.discount_amt, ' || v_discount_expr || ')';
  END IF;

  v_coupon_discount_expr := 'COALESCE((o.payload->>''couponDiscountAmt'')::numeric, (o.payload->>''coupon_discount_amt'')::numeric, 0)';
  IF v_has_coupon_discount_amt THEN
    v_coupon_discount_expr := 'COALESCE(o.coupon_discount_amt, ' || v_coupon_discount_expr || ')';
  END IF;

  v_guest_count_expr := 'COALESCE((o.payload->>''guestCount'')::integer, (o.payload->>''guest_count'')::integer, 0)';
  IF v_has_guest_count THEN
    v_guest_count_expr := 'COALESCE(o.guest_count, ' || v_guest_count_expr || ')';
  END IF;

  IF v_has_store_code THEN
    v_store_expr := 'COALESCE(o.store_code, '''')';
  ELSIF v_has_store_name THEN
    v_store_expr := 'COALESCE(o.store_name, '''')';
  ELSE
    v_store_expr := 'COALESCE((o.payload->>''storeCode''), (o.payload->>''store_code''), '''')';
  END IF;

  IF v_has_status THEN
    v_status_expr := 'COALESCE(o.status, '''')';
  ELSE
    v_status_expr := 'COALESCE((o.payload->>''status''), '''')';
  END IF;

  IF v_has_order_type THEN
    v_order_type_expr := 'COALESCE(o.order_type, '''')';
  ELSE
    v_order_type_expr := 'COALESCE((o.payload->>''orderType''), (o.payload->>''order_type''), '''')';
  END IF;

  v_sql := '
    SELECT
      o.created_at,
      (' || v_total_expr || ')::numeric AS total,
      (' || v_subtotal_expr || ')::numeric AS subtotal,
      (' || v_vat_expr || ')::numeric AS vat,
      (' || v_discount_expr || ')::numeric AS discount_amt,
      (' || v_coupon_discount_expr || ')::numeric AS coupon_discount_amt,
      (' || v_guest_count_expr || ')::integer AS guest_count,
      (' || v_store_expr || ')::text AS store_code,
      (' || v_status_expr || ')::text AS status,
      (' || v_order_type_expr || ')::text AS order_type
    FROM public.pos_orders o
    WHERE o.created_at >= $1
      AND o.created_at < $2
      AND (
        $3 IS NULL
        OR COALESCE(array_length($3, 1), 0) = 0
        OR (' || v_store_expr || ') = ANY ($3)
      )
    ORDER BY o.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE($4, 50000), 100000))
  ';

  RETURN QUERY EXECUTE v_sql USING p_start_utc, p_end_utc_exclusive, p_store_codes, p_limit;
END;
$$;

COMMIT;
