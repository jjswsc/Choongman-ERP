-- 매출 관리 집계 RPC — pos_orders 전량 fetch 없이 GROUP BY (행 수 상한 없음)
-- Supabase SQL Editor에서 실행 후 /api/posSalesBy* 가 RPC 우선 사용.
--
-- 선행(충만·Omni 공통): RPC가 o.tenant_id 를 참조하므로 컬럼이 없으면 42703.
-- 충만은 보통 p_tenant_id=null 이라 필터는 no-op. Omni만 tenant 격리에 사용.
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS tenant_id text;
CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant_id ON public.pos_orders (tenant_id);
--
-- p_agg_mode:
--   store | store_channel | period | period_by_store | channel | payment
--   | delivery_platform | delivery_payment | delivery_app | menu
--   delivery_app = channel + delivery_platform 을 한 번 스캔(bucket_key2=channel|platform)
-- p_period_group (period*): day | month | year | week | dow | hour

CREATE OR REPLACE FUNCTION public.pos_sales_norm_store_key(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_raw, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_is_office_store(p_store_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    lower(btrim(coalesce(p_store_code, ''))) LIKE '%본사%'
    OR lower(btrim(coalesce(p_store_code, ''))) LIKE '%오피스%'
    OR lower(btrim(coalesce(p_store_code, ''))) LIKE '%본점%'
    OR lower(btrim(coalesce(p_store_code, ''))) LIKE '%office%'
    OR lower(btrim(coalesce(p_store_code, ''))) LIKE '%head office%'
    OR lower(btrim(coalesce(p_store_code, ''))) LIKE '%hq%'
    OR lower(btrim(coalesce(p_store_code, ''))) = 'test',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_norm_order_type(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_raw, '')) = '' THEN 'dine_in'
    WHEN lower(replace(btrim(p_raw), '-', '_')) IN ('dine_in', 'takeout', 'delivery')
      THEN lower(replace(btrim(p_raw), '-', '_'))
    ELSE lower(replace(btrim(p_raw), '-', '_'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_order_type_allowed(
  p_order_type text,
  p_allowed text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_allowed IS NULL
    OR coalesce(array_length(p_allowed, 1), 0) = 0
    OR public.pos_sales_norm_order_type(p_order_type) = ANY (p_allowed)
    OR (
      btrim(coalesce(p_order_type, '')) = ''
      AND 'dine_in' = ANY (p_allowed)
    );
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_resolve_discount(
  p_discount_amt numeric,
  p_coupon_discount_amt numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_coupon_discount_amt, 0) <= 0.0001 THEN greatest(coalesce(p_discount_amt, 0), 0)
    WHEN coalesce(p_discount_amt, 0) + 0.0001 >= coalesce(p_coupon_discount_amt, 0)
      THEN greatest(coalesce(p_discount_amt, 0), 0)
    ELSE greatest(coalesce(p_discount_amt, 0), 0) + greatest(coalesce(p_coupon_discount_amt, 0), 0)
  END;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_store_biz_hours(
  p_store_code text,
  p_biz_hours jsonb
)
RETURNS TABLE (start_hour int, start_minute int, end_hour int, end_minute int)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key text;
  v_node jsonb;
BEGIN
  start_hour := coalesce((p_biz_hours->'global'->>'startHour')::int, 8);
  start_minute := coalesce((p_biz_hours->'global'->>'startMinute')::int, 0);
  end_hour := coalesce((p_biz_hours->'global'->>'endHour')::int, 8);
  end_minute := coalesce((p_biz_hours->'global'->>'endMinute')::int, 0);

  v_key := public.pos_sales_norm_store_key(p_store_code);
  IF p_biz_hours ? 'stores' AND (p_biz_hours->'stores') ? v_key THEN
    v_node := p_biz_hours->'stores'->v_key;
    start_hour := coalesce((v_node->>'startHour')::int, start_hour);
    start_minute := coalesce((v_node->>'startMinute')::int, start_minute);
    end_hour := coalesce((v_node->>'endHour')::int, end_hour);
    end_minute := coalesce((v_node->>'endMinute')::int, end_minute);
  END IF;
  RETURN NEXT;
END;
$$;

-- 24h 창(start=end) 및 동일일 창 기준 영업일. 심야 넘김(end<start)은 방콕 달력일 폴백.
CREATE OR REPLACE FUNCTION public.pos_sales_business_ymd(
  p_created_at timestamptz,
  p_store_code text,
  p_biz_hours jsonb
)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sh int; v_sm int; v_eh int; v_em int;
  v_local timestamp;
  v_start_min int; v_end_min int;
BEGIN
  SELECT h.start_hour, h.start_minute, h.end_hour, h.end_minute
    INTO v_sh, v_sm, v_eh, v_em
  FROM public.pos_sales_store_biz_hours(p_store_code, p_biz_hours) h;

  v_local := timezone('Asia/Bangkok', p_created_at);
  v_start_min := v_sh * 60 + v_sm;
  v_end_min := v_eh * 60 + v_em;

  IF v_end_min = v_start_min THEN
    RETURN (v_local - make_interval(hours => v_sh, mins => v_sm))::date;
  END IF;

  IF v_end_min > v_start_min THEN
    RETURN (v_local - make_interval(hours => v_sh, mins => v_sm))::date;
  END IF;

  RETURN v_local::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_period_bucket_key(
  p_biz_ymd date,
  p_created_at timestamptz,
  p_period_group text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_g text;
  v_mon date;
  v_sun date;
  v_h int;
BEGIN
  v_g := lower(coalesce(p_period_group, 'day'));
  IF v_g = 'month' THEN
    RETURN to_char(p_biz_ymd, 'YYYY-MM');
  ELSIF v_g = 'year' THEN
    RETURN to_char(p_biz_ymd, 'YYYY');
  ELSIF v_g = 'dow' THEN
    RETURN extract(dow FROM p_biz_ymd)::int::text;
  ELSIF v_g = 'hour' THEN
    v_h := extract(hour FROM timezone('Asia/Bangkok', p_created_at))::int;
    RETURN lpad(greatest(0, least(23, v_h))::text, 2, '0');
  ELSIF v_g = 'week' THEN
    v_mon := p_biz_ymd - ((extract(dow FROM p_biz_ymd)::int + 6) % 7);
    v_sun := v_mon + 6;
    RETURN to_char(v_mon, 'YYYY-MM-DD') || '~' || to_char(v_sun, 'YYYY-MM-DD');
  END IF;
  RETURN to_char(p_biz_ymd, 'YYYY-MM-DD');
END;
$$;

-- RETURNS TABLE / 인자 변경 시 CREATE OR REPLACE 불가 → 기존 시그니처 DROP 후 재생성
DROP FUNCTION IF EXISTS public.get_pos_sales_analytics_agg(
  timestamptz, timestamptz, text, text, text[], text[], text, text, jsonb, text[], boolean
);
DROP FUNCTION IF EXISTS public.get_pos_sales_analytics_agg(
  timestamptz, timestamptz, text, text, text[], text[], text, text, jsonb, text[], boolean, text
);

CREATE OR REPLACE FUNCTION public.get_pos_sales_analytics_agg(
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz,
  p_start_ymd text,
  p_end_ymd text,
  p_store_codes text[] DEFAULT NULL,
  p_order_types text[] DEFAULT NULL,
  p_agg_mode text DEFAULT 'store',
  p_period_group text DEFAULT 'day',
  p_biz_hours jsonb DEFAULT '{"global":{"startHour":8,"startMinute":0,"endHour":8,"endMinute":0},"stores":{}}'::jsonb,
  p_menu_search_tokens text[] DEFAULT NULL,
  p_menu_search_and boolean DEFAULT false,
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE (
  bucket_key text,
  bucket_key2 text,
  order_count bigint,
  subtotal numeric,
  vat numeric,
  discount numeric,
  service_amt numeric,
  total numeric,
  guest_sum bigint,
  dine_in_order_count bigint,
  dine_in_total numeric,
  dine_in_guest_sum bigint,
  menu_qty numeric,
  payment_key text,
  cash_sales numeric,
  credit_sales numeric,
  qr_sales numeric,
  other_sales numeric,
  delivery_app_sales numeric
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
      coalesce(o.subtotal, 0)::numeric AS subtotal,
      coalesce(o.vat, 0)::numeric AS vat,
      public.pos_sales_resolve_discount(o.discount_amt, o.coupon_discount_amt) AS discount,
      coalesce(o.service_amt, 0)::numeric AS service_amt,
      greatest(coalesce(o.guest_count, 0), 0)::bigint AS guest_count,
      coalesce(o.payment_cash, 0)::numeric AS payment_cash,
      coalesce(o.payment_card, 0)::numeric AS payment_card,
      coalesce(o.payment_qr, 0)::numeric AS payment_qr,
      coalesce(o.payment_other, 0)::numeric AS payment_other,
      coalesce(o.payment_delivery_app, 0)::numeric AS payment_delivery_app,
      coalesce(o.delivery_payment_channel, '') AS delivery_payment_channel,
      coalesce(o.delivery_app_code, '') AS delivery_app_code,
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
      public.pos_sales_business_ymd(r.created_at, r.store_code, p_biz_hours) AS biz_ymd,
      public.pos_sales_norm_order_type(r.order_type) AS norm_order_type
    FROM raw r
    WHERE lower(btrim(r.status)) IN ('completed', 'paid', 'ready')
      AND NOT public.pos_sales_is_office_store(r.store_code)
      AND public.pos_sales_order_type_allowed(r.order_type, p_order_types)
  ),
  in_range AS (
    SELECT *
    FROM filtered f
    WHERE f.biz_ymd >= p_start_ymd::date
      AND f.biz_ymd <= p_end_ymd::date
  ),
  menu_lines AS (
    SELECT
      f.store_code,
      f.biz_ymd,
      f.created_at,
      f.norm_order_type,
      elem AS item
    FROM in_range f
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN coalesce(f.items_json, '') ~ '^\s*\['
          THEN coalesce(f.items_json::jsonb, '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS elem
    WHERE lower(coalesce(p_agg_mode, '')) = 'menu'
  ),
  menu_filtered AS (
    SELECT
      ml.store_code,
      coalesce(nullif(btrim(ml.item->>'name'), ''), '(없음)') AS menu_name,
      greatest(coalesce((ml.item->>'qty')::numeric, 0), 0) AS qty,
      greatest(coalesce((ml.item->>'qty')::numeric, 0), 0)
        * coalesce((ml.item->>'price')::numeric, 0) AS sales
    FROM menu_lines ml
    WHERE (
      p_menu_search_tokens IS NULL
      OR coalesce(array_length(p_menu_search_tokens, 1), 0) = 0
      OR (
        CASE
          WHEN coalesce(p_menu_search_and, false) THEN
            NOT EXISTS (
              SELECT 1
              FROM unnest(p_menu_search_tokens) tok
              WHERE lower(coalesce(ml.item->>'name', '')) NOT LIKE '%' || lower(tok) || '%'
            )
          ELSE
            EXISTS (
              SELECT 1
              FROM unnest(p_menu_search_tokens) tok
              WHERE lower(coalesce(ml.item->>'name', '')) LIKE '%' || lower(tok) || '%'
            )
        END
      )
    )
  )
  SELECT
    agg.bucket_key,
    agg.bucket_key2,
    agg.order_count,
    agg.subtotal,
    agg.vat,
    agg.discount,
    agg.service_amt,
    agg.total,
    agg.guest_sum,
    agg.dine_in_order_count,
    agg.dine_in_total,
    agg.dine_in_guest_sum,
    agg.menu_qty,
    agg.payment_key,
    agg.cash_sales,
    agg.credit_sales,
    agg.qr_sales,
    agg.other_sales,
    agg.delivery_app_sales
  FROM (
    -- store
    SELECT
      f.store_code AS bucket_key,
      ''::text AS bucket_key2,
      count(*)::bigint AS order_count,
      sum(f.subtotal) AS subtotal,
      sum(f.vat) AS vat,
      sum(f.discount) AS discount,
      sum(f.service_amt) AS service_amt,
      sum(f.total) AS total,
      coalesce(sum(f.guest_count), 0)::bigint AS guest_sum,
      count(*) FILTER (WHERE f.norm_order_type IN ('dine_in', ''))::bigint AS dine_in_order_count,
      coalesce(sum(f.total) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0) AS dine_in_total,
      coalesce(sum(f.guest_count) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0)::bigint AS dine_in_guest_sum,
      0::numeric AS menu_qty,
      NULL::text AS payment_key,
      0::numeric AS cash_sales,
      0::numeric AS credit_sales,
      0::numeric AS qr_sales,
      0::numeric AS other_sales,
      0::numeric AS delivery_app_sales
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'store'
    GROUP BY f.store_code

    UNION ALL

    -- store_channel (bucket_key=store, bucket_key2=dine_in|takeout|delivery)
    SELECT
      f.store_code AS bucket_key,
      CASE
        WHEN f.norm_order_type IN ('dine_in', '') THEN 'dine_in'
        WHEN f.norm_order_type IN ('takeout', 'delivery') THEN f.norm_order_type
        ELSE 'unknown'
      END AS bucket_key2,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      0::numeric,
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'store_channel'
    GROUP BY f.store_code, 2

    UNION ALL

    -- period
    SELECT
      public.pos_sales_period_bucket_key(f.biz_ymd, f.created_at, p_period_group) AS bucket_key,
      ''::text AS bucket_key2,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      count(*) FILTER (WHERE f.norm_order_type IN ('dine_in', ''))::bigint,
      coalesce(sum(f.total) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0),
      coalesce(sum(f.guest_count) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0)::bigint,
      0::numeric,
      NULL::text,
      coalesce(sum(f.payment_cash), 0),
      coalesce(sum(f.payment_card), 0),
      coalesce(sum(f.payment_qr), 0),
      coalesce(sum(f.payment_other), 0),
      coalesce(sum(f.payment_delivery_app), 0)
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'period'
    GROUP BY 1

    UNION ALL

    -- period_by_store
    SELECT
      public.pos_sales_period_bucket_key(f.biz_ymd, f.created_at, p_period_group) AS bucket_key,
      f.store_code AS bucket_key2,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      count(*) FILTER (WHERE f.norm_order_type IN ('dine_in', ''))::bigint,
      coalesce(sum(f.total) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0),
      coalesce(sum(f.guest_count) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0)::bigint,
      0::numeric,
      NULL::text,
      coalesce(sum(f.payment_cash), 0),
      coalesce(sum(f.payment_card), 0),
      coalesce(sum(f.payment_qr), 0),
      coalesce(sum(f.payment_other), 0),
      coalesce(sum(f.payment_delivery_app), 0)
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'period_by_store'
    GROUP BY 1, f.store_code

    UNION ALL

    -- channel
    SELECT
      CASE
        WHEN f.norm_order_type IN ('dine_in', '') THEN 'dine_in'
        WHEN f.norm_order_type IN ('takeout', 'delivery') THEN f.norm_order_type
        ELSE 'unknown'
      END AS bucket_key,
      ''::text,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      0::numeric,
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'channel'
    GROUP BY 1

    UNION ALL

    -- delivery_platform (delivery orders only)
    SELECT
      CASE WHEN btrim(f.delivery_app_code) = '' THEN '_unspecified' ELSE btrim(f.delivery_app_code) END,
      ''::text,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      0::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      0::numeric,
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'delivery_platform'
      AND f.norm_order_type = 'delivery'
    GROUP BY 1

    UNION ALL

    -- delivery_payment: payment_delivery_app by channel (POS 결산·매출관리 Payment/Card 배달 표)
    SELECT
      CASE
        WHEN lower(btrim(coalesce(f.delivery_app_code, ''))) LIKE '%foodpanda%' THEN 'foodpanda'
        WHEN lower(btrim(coalesce(f.delivery_app_code, f.delivery_payment_channel, ''))) LIKE '%robinhood%' THEN 'robinhood'
        WHEN lower(btrim(coalesce(f.delivery_app_code, f.delivery_payment_channel, ''))) LIKE '%shopee%pay%' THEN 'shopee_pay'
        WHEN lower(btrim(coalesce(f.delivery_app_code, f.delivery_payment_channel, ''))) LIKE '%shopee%' THEN 'shopee'
        WHEN lower(btrim(coalesce(f.delivery_app_code, f.delivery_payment_channel, ''))) IN ('grab', 'lineman', 'line_man') THEN
          CASE WHEN lower(btrim(coalesce(f.delivery_app_code, f.delivery_payment_channel, ''))) IN ('lineman', 'line_man') THEN 'lineman' ELSE 'grab' END
        WHEN btrim(coalesce(f.delivery_app_code, '')) <> '' THEN lower(btrim(f.delivery_app_code))
        WHEN btrim(coalesce(f.delivery_payment_channel, '')) <> '' THEN lower(btrim(f.delivery_payment_channel))
        ELSE '_unspecified'
      END,
      ''::text,
      count(*)::bigint,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      sum(f.payment_delivery_app),
      0::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      0::numeric,
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'delivery_payment'
      AND coalesce(f.payment_delivery_app, 0) > 0
      AND NOT (
        f.norm_order_type = 'dine_in'
        OR lower(btrim(coalesce(f.delivery_payment_channel, ''))) = 'dine_in'
      )
    GROUP BY 1

    UNION ALL

    -- delivery_app: channel rows (bucket_key2=channel) — posSalesByDeliveryApp 단일 RPC용
    SELECT
      CASE
        WHEN f.norm_order_type IN ('dine_in', '') THEN 'dine_in'
        WHEN f.norm_order_type IN ('takeout', 'delivery') THEN f.norm_order_type
        ELSE 'unknown'
      END AS bucket_key,
      'channel'::text AS bucket_key2,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      0::numeric,
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'delivery_app'
    GROUP BY 1

    UNION ALL

    -- delivery_app: platform rows (bucket_key2=platform)
    SELECT
      CASE WHEN btrim(f.delivery_app_code) = '' THEN '_unspecified' ELSE btrim(f.delivery_app_code) END,
      'platform'::text,
      count(*)::bigint,
      sum(f.subtotal),
      sum(f.vat),
      sum(f.discount),
      sum(f.service_amt),
      sum(f.total),
      0::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      0::numeric,
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM in_range f
    WHERE lower(coalesce(p_agg_mode, '')) = 'delivery_app'
      AND f.norm_order_type = 'delivery'
    GROUP BY 1

    UNION ALL

    -- menu
    SELECT
      mf.menu_name,
      ''::text,
      0::bigint,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      sum(mf.sales),
      0::bigint,
      0::bigint,
      0::numeric,
      0::bigint,
      sum(mf.qty),
      NULL::text,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    FROM menu_filtered mf
    GROUP BY mf.menu_name

    UNION ALL

    -- payment (unpivot)
    SELECT p.bucket_key, ''::text, 0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric, p.sales, 0::bigint, 0::bigint, 0::numeric, 0::bigint, 0::numeric, p.bucket_key, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM (
      SELECT 'cash'::text AS bucket_key, sum(f.payment_cash) AS sales FROM in_range f WHERE f.payment_cash > 0
      UNION ALL SELECT 'card', sum(f.payment_card) FROM in_range f WHERE f.payment_card > 0
      UNION ALL SELECT 'qr', sum(f.payment_qr) FROM in_range f WHERE f.payment_qr > 0
      UNION ALL SELECT 'other', sum(f.payment_other) FROM in_range f WHERE f.payment_other > 0
      UNION ALL SELECT 'delivery_app', sum(f.payment_delivery_app) FROM in_range f WHERE f.payment_delivery_app > 0
    ) p
    WHERE lower(coalesce(p_agg_mode, '')) = 'payment'
      AND coalesce(p.sales, 0) > 0
  ) agg;
END;
$$;

COMMENT ON FUNCTION public.get_pos_sales_analytics_agg(
  timestamptz, timestamptz, text, text, text[], text[], text, text, jsonb, text[], boolean, text
) IS '매출 관리: store/period/channel/payment/menu 등 DB 집계 (pos_orders 행 상한 없음). Omni는 p_tenant_id로 격리.';

GRANT EXECUTE ON FUNCTION public.get_pos_sales_analytics_agg(
  timestamptz, timestamptz, text, text, text[], text[], text, text, jsonb, text[], boolean, text
) TO anon, authenticated, service_role;
