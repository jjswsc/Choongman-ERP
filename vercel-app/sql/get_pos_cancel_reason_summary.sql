-- 매출 관리 취소사유 집계 RPC — pos_orders 전량+items_json Node 다운로드 없이 DB GROUP BY
-- Supabase SQL Editor에서 실행 후 /api/posCancelReasonSummary 가 RPC 우선 사용.
--
-- 선행: pos_sales_business_ymd / pos_sales_is_office_store / pos_sales_order_type_allowed
--       (get_pos_sales_analytics_agg.sql 과 동일 헬퍼)
--
-- 반환: bucket_kind = 'line' | 'order', reason, cancel_count, cancel_amount
-- line = items_json 품목별 cancelledAt, order = 주문 취소·환불(합석 흡수 제외)

ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS tenant_id text;
CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant_id ON public.pos_orders (tenant_id);

CREATE OR REPLACE FUNCTION public.pos_sales_norm_cancel_reason(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_raw, '')) = '' THEN '__POS_CANCEL_REASON_EMPTY__'
    ELSE btrim(p_raw)
  END;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_is_merged_absorb_memo(p_memo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM regexp_split_to_table(coalesce(p_memo, ''), E'\\r?\\n') AS line
    WHERE btrim(line) ~ '^\[ORDER_MERGED\s'
  );
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_is_stats_cancellation(
  p_status text,
  p_memo text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN lower(btrim(coalesce(p_status, ''))) = 'refunded' THEN true
      WHEN lower(btrim(coalesce(p_status, ''))) IN ('cancelled', 'canceled')
        THEN NOT public.pos_sales_is_merged_absorb_memo(p_memo)
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_order_cancel_reason_from_memo(p_memo text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_line text;
  v_m text[];
  v_reason text := '';
BEGIN
  FOR v_line IN
    SELECT btrim(line)
    FROM regexp_split_to_table(coalesce(p_memo, ''), E'\\r?\\n') WITH ORDINALITY AS t(line, ord)
    ORDER BY ord DESC
  LOOP
    v_m := regexp_match(v_line, '^\[ORDER_(?:CANCELLED|REFUNDED)\s+[^\]]+\]\s*(.*)$');
    IF v_m IS NOT NULL THEN
      v_reason := coalesce(v_m[1], '');
      EXIT;
    END IF;
  END LOOP;
  RETURN public.pos_sales_norm_cancel_reason(v_reason);
END;
$$;

DROP FUNCTION IF EXISTS public.get_pos_cancel_reason_summary(
  timestamptz, timestamptz, text, text, text[], text[], jsonb, text
);

CREATE OR REPLACE FUNCTION public.get_pos_cancel_reason_summary(
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz,
  p_start_ymd text,
  p_end_ymd text,
  p_store_codes text[] DEFAULT NULL,
  p_order_types text[] DEFAULT NULL,
  p_biz_hours jsonb DEFAULT '{"global":{"startHour":8,"startMinute":0,"endHour":8,"endMinute":0},"stores":{}}'::jsonb,
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE (
  bucket_kind text,
  reason text,
  cancel_count bigint,
  cancel_amount numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH raw AS (
    SELECT
      o.created_at,
      btrim(coalesce(o.store_code, '')) AS store_code,
      coalesce(o.status, '') AS status,
      coalesce(o.order_type, '') AS order_type,
      coalesce(o.total, 0)::numeric AS total,
      coalesce(o.memo, '') AS memo,
      o.items_json
    FROM public.pos_orders o
    WHERE o.created_at >= p_start_utc
      AND o.created_at < p_end_utc_exclusive
      AND (
        p_store_codes IS NULL
        OR coalesce(array_length(p_store_codes, 1), 0) = 0
        OR btrim(coalesce(o.store_code, '')) = ANY (p_store_codes)
      )
      AND (
        coalesce(trim(p_tenant_id), '') = ''
        OR coalesce(trim(o.tenant_id), '') = trim(p_tenant_id)
      )
  ),
  filtered AS (
    SELECT
      r.*,
      public.pos_sales_business_ymd(r.created_at, r.store_code, p_biz_hours) AS biz_ymd
    FROM raw r
    WHERE NOT public.pos_sales_is_office_store(r.store_code)
      AND public.pos_sales_order_type_allowed(r.order_type, p_order_types)
  ),
  in_range AS (
    SELECT *
    FROM filtered f
    WHERE f.biz_ymd >= p_start_ymd::date
      AND f.biz_ymd <= p_end_ymd::date
  ),
  line_items AS (
    SELECT
      public.pos_sales_norm_cancel_reason(coalesce(elem->>'cancelReason', '')) AS reason,
      1::bigint AS cnt,
      greatest(coalesce((elem->>'price')::numeric, 0), 0)
        * greatest(
            coalesce(
              nullif(elem->>'qty', '')::numeric,
              nullif(elem->>'quantity', '')::numeric,
              1
            ),
            1
          ) AS amt
    FROM in_range ir
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN coalesce(ir.items_json, '') ~ '^\s*\['
          THEN coalesce(ir.items_json::jsonb, '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS elem
    WHERE btrim(coalesce(elem->>'cancelledAt', '')) <> ''
  ),
  line_agg AS (
    SELECT
      'line'::text AS bucket_kind,
      li.reason,
      sum(li.cnt)::bigint AS cancel_count,
      sum(li.amt)::numeric AS cancel_amount
    FROM line_items li
    GROUP BY li.reason
  ),
  order_items AS (
    SELECT
      public.pos_sales_order_cancel_reason_from_memo(ir.memo) AS reason,
      1::bigint AS cnt,
      greatest(ir.total, 0) AS amt
    FROM in_range ir
    WHERE public.pos_sales_is_stats_cancellation(ir.status, ir.memo)
  ),
  order_agg AS (
    SELECT
      'order'::text AS bucket_kind,
      oi.reason,
      sum(oi.cnt)::bigint AS cancel_count,
      sum(oi.amt)::numeric AS cancel_amount
    FROM order_items oi
    GROUP BY oi.reason
  )
  SELECT u.bucket_kind, u.reason, u.cancel_count, u.cancel_amount
  FROM (
    SELECT * FROM line_agg
    UNION ALL
    SELECT * FROM order_agg
  ) u
  ORDER BY u.bucket_kind, u.cancel_count DESC, u.cancel_amount DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pos_cancel_reason_summary(
  timestamptz, timestamptz, text, text, text[], text[], jsonb, text
) TO anon, authenticated, service_role;
