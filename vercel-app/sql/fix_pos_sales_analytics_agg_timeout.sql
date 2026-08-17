-- 충만 DB 매출 RPC 57014 (statement timeout) 한 번 붙여넣기
-- 대상: faxolqgaadcvyeyvrydc
-- 순서: 헬퍼+집계 RPC → 취소사유 RPC. Vercel 재배포와 별개(DB 함수만).
-- 내용은 get_pos_sales_analytics_agg.sql + get_pos_cancel_reason_summary.sql 과 동일.
-- 매출 관리 집계 RPC — pos_orders 전량 fetch 없이 GROUP BY (행 수 상한 없음)
-- Supabase SQL Editor에서 실행 후 /api/posSalesBy* 가 RPC 우선 사용.
-- 57014(statement timeout) 완화: 헬퍼 SQL 인라인 + 모드별 IF 1개만 실행 + items_json은 menu만.
--
-- 선행(충만·Omni 공통): RPC가 o.tenant_id 를 참조하므로 컬럼이 없으면 42703.
-- 충만은 보통 p_tenant_id=null 이라 필터는 no-op. Omni만 tenant 격리에 사용.
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS tenant_id text;
CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant_id ON public.pos_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created_at ON public.pos_orders (created_at);
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

-- LANGUAGE sql 로 인라인. PL/pgSQL 행단위 호출은 매출 RPC statement_timeout(57014) 원인.
CREATE OR REPLACE FUNCTION public.pos_sales_store_biz_hours(
  p_store_code text,
  p_biz_hours jsonb
)
RETURNS TABLE (start_hour int, start_minute int, end_hour int, end_minute int)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    coalesce((n.store_node->>'startHour')::int, (p_biz_hours->'global'->>'startHour')::int, 8),
    coalesce((n.store_node->>'startMinute')::int, (p_biz_hours->'global'->>'startMinute')::int, 0),
    coalesce((n.store_node->>'endHour')::int, (p_biz_hours->'global'->>'endHour')::int, 8),
    coalesce((n.store_node->>'endMinute')::int, (p_biz_hours->'global'->>'endMinute')::int, 0)
  FROM (
    SELECT CASE
      WHEN p_biz_hours ? 'stores' AND (p_biz_hours->'stores') ? k.store_key
        THEN p_biz_hours->'stores'->k.store_key
      ELSE NULL::jsonb
    END AS store_node
    FROM (SELECT public.pos_sales_norm_store_key(p_store_code) AS store_key) k
  ) n;
$$;

-- 24h 창(start=end) 및 동일일 창 기준 영업일. 심야 넘김(end<start)은 방콕 달력일 폴백.
CREATE OR REPLACE FUNCTION public.pos_sales_business_ymd_from_clock(
  p_created_at timestamptz,
  p_start_hour int,
  p_start_minute int,
  p_end_hour int,
  p_end_minute int
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (coalesce(p_end_hour, 8) * 60 + coalesce(p_end_minute, 0))
       >= (coalesce(p_start_hour, 8) * 60 + coalesce(p_start_minute, 0))
      THEN (
        timezone('Asia/Bangkok', p_created_at)
        - make_interval(
            hours => coalesce(p_start_hour, 8),
            mins => coalesce(p_start_minute, 0)
          )
      )::date
    ELSE timezone('Asia/Bangkok', p_created_at)::date
  END;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_business_ymd(
  p_created_at timestamptz,
  p_store_code text,
  p_biz_hours jsonb
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT public.pos_sales_business_ymd_from_clock(
    p_created_at,
    h.start_hour,
    h.start_minute,
    h.end_hour,
    h.end_minute
  )
  FROM public.pos_sales_store_biz_hours(p_store_code, p_biz_hours) h;
$$;

CREATE OR REPLACE FUNCTION public.pos_sales_period_bucket_key(
  p_biz_ymd date,
  p_created_at timestamptz,
  p_period_group text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_period_group, 'day'))
    WHEN 'month' THEN to_char(p_biz_ymd, 'YYYY-MM')
    WHEN 'year' THEN to_char(p_biz_ymd, 'YYYY')
    WHEN 'dow' THEN extract(dow FROM p_biz_ymd)::int::text
    WHEN 'hour' THEN lpad(
      greatest(0, least(23, extract(hour FROM timezone('Asia/Bangkok', p_created_at))::int))::text,
      2, '0'
    )
    WHEN 'week' THEN
      to_char(p_biz_ymd - ((extract(dow FROM p_biz_ymd)::int + 6) % 7), 'YYYY-MM-DD')
      || '~'
      || to_char((p_biz_ymd - ((extract(dow FROM p_biz_ymd)::int + 6) % 7)) + 6, 'YYYY-MM-DD')
    ELSE to_char(p_biz_ymd, 'YYYY-MM-DD')
  END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_sales_store_biz_hours(text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_sales_business_ymd_from_clock(timestamptz, int, int, int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_sales_business_ymd(timestamptz, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_sales_period_bucket_key(date, timestamptz, text) TO anon, authenticated, service_role;

-- RETURNS TABLE / 인자 변경 시 CREATE OR REPLACE 불가 → 기존 시그니처 DROP 후 재생성
-- 57014: UNION ALL 전 모드 실행 금지 → 모드별 IF. 영업시간은 JSON 1회 펼침 후 JOIN.
DROP FUNCTION IF EXISTS public.pos_sales_analytics_base(
  timestamptz, timestamptz, date, date, text[], text[], jsonb, text
);

CREATE OR REPLACE FUNCTION public.pos_sales_analytics_base(
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz,
  p_start_ymd date,
  p_end_ymd date,
  p_store_codes text[],
  p_order_types text[],
  p_biz_hours jsonb,
  p_tenant_id text
)
RETURNS TABLE (
  id bigint,
  created_at timestamptz,
  store_code text,
  order_type text,
  norm_order_type text,
  total numeric,
  subtotal numeric,
  vat numeric,
  discount numeric,
  service_amt numeric,
  guest_count bigint,
  payment_cash numeric,
  payment_card numeric,
  payment_qr numeric,
  payment_other numeric,
  payment_delivery_app numeric,
  delivery_payment_channel text,
  delivery_app_code text,
  biz_ymd date
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH hours_global AS (
    SELECT
      coalesce((p_biz_hours #>> '{global,startHour}')::int, 8) AS start_hour,
      coalesce((p_biz_hours #>> '{global,startMinute}')::int, 0) AS start_minute,
      coalesce((p_biz_hours #>> '{global,endHour}')::int, 8) AS end_hour,
      coalesce((p_biz_hours #>> '{global,endMinute}')::int, 0) AS end_minute
  ),
  hours_store AS (
    SELECT
      public.pos_sales_norm_store_key(kv.key) AS store_key,
      coalesce((kv.value->>'startHour')::int, g.start_hour) AS start_hour,
      coalesce((kv.value->>'startMinute')::int, g.start_minute) AS start_minute,
      coalesce((kv.value->>'endHour')::int, g.end_hour) AS end_hour,
      coalesce((kv.value->>'endMinute')::int, g.end_minute) AS end_minute
    FROM hours_global g
    CROSS JOIN LATERAL jsonb_each(coalesce(p_biz_hours->'stores', '{}'::jsonb)) AS kv(key, value)
  )
  SELECT s.id, s.created_at, s.store_code, s.order_type, s.norm_order_type, s.total, s.subtotal, s.vat,
         s.discount, s.service_amt, s.guest_count, s.payment_cash, s.payment_card, s.payment_qr,
         s.payment_other, s.payment_delivery_app, s.delivery_payment_channel, s.delivery_app_code,
         s.biz_ymd
  FROM (
    SELECT
      o.id,
      o.created_at,
      btrim(coalesce(o.store_code, '')) AS store_code,
      coalesce(o.order_type, '') AS order_type,
      public.pos_sales_norm_order_type(o.order_type) AS norm_order_type,
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
      public.pos_sales_business_ymd_from_clock(
        o.created_at,
        coalesce(hs.start_hour, hg.start_hour),
        coalesce(hs.start_minute, hg.start_minute),
        coalesce(hs.end_hour, hg.end_hour),
        coalesce(hs.end_minute, hg.end_minute)
      ) AS biz_ymd
    FROM public.pos_orders o
    CROSS JOIN hours_global hg
    LEFT JOIN hours_store hs
      ON hs.store_key = public.pos_sales_norm_store_key(btrim(coalesce(o.store_code, '')))
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
      AND lower(btrim(coalesce(o.status, ''))) IN ('completed', 'paid', 'ready')
      AND NOT public.pos_sales_is_office_store(btrim(coalesce(o.store_code, '')))
      AND public.pos_sales_order_type_allowed(coalesce(o.order_type, ''), p_order_types)
  ) s
  WHERE s.biz_ymd >= p_start_ymd
    AND s.biz_ymd <= p_end_ymd
$$;

GRANT EXECUTE ON FUNCTION public.pos_sales_analytics_base(
  timestamptz, timestamptz, date, date, text[], text[], jsonb, text
) TO anon, authenticated, service_role;

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
DECLARE
  v_mode text := lower(coalesce(p_agg_mode, 'store'));
  v_start date := p_start_ymd::date;
  v_end date := p_end_ymd::date;
BEGIN
  IF v_mode = 'store' THEN
    RETURN QUERY
    SELECT
      f.store_code,
      ''::text,
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
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    GROUP BY f.store_code;

  ELSIF v_mode = 'store_channel' THEN
    RETURN QUERY
    SELECT
      f.store_code,
      CASE
        WHEN f.norm_order_type IN ('dine_in', '') THEN 'dine_in'
        WHEN f.norm_order_type IN ('takeout', 'delivery') THEN f.norm_order_type
        ELSE 'unknown'
      END,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      0::bigint, 0::numeric, 0::bigint, 0::numeric, NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    GROUP BY f.store_code, 2;

  ELSIF v_mode = 'period' THEN
    RETURN QUERY
    SELECT
      public.pos_sales_period_bucket_key(f.biz_ymd, f.created_at, p_period_group),
      ''::text,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      count(*) FILTER (WHERE f.norm_order_type IN ('dine_in', ''))::bigint,
      coalesce(sum(f.total) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0),
      coalesce(sum(f.guest_count) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0)::bigint,
      0::numeric, NULL::text,
      coalesce(sum(f.payment_cash), 0),
      coalesce(sum(f.payment_card), 0),
      coalesce(sum(f.payment_qr), 0),
      coalesce(sum(f.payment_other), 0),
      coalesce(sum(f.payment_delivery_app), 0)
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    GROUP BY 1;

  ELSIF v_mode = 'period_by_store' THEN
    RETURN QUERY
    SELECT
      public.pos_sales_period_bucket_key(f.biz_ymd, f.created_at, p_period_group),
      f.store_code,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      count(*) FILTER (WHERE f.norm_order_type IN ('dine_in', ''))::bigint,
      coalesce(sum(f.total) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0),
      coalesce(sum(f.guest_count) FILTER (WHERE f.norm_order_type IN ('dine_in', '')), 0)::bigint,
      0::numeric, NULL::text,
      coalesce(sum(f.payment_cash), 0),
      coalesce(sum(f.payment_card), 0),
      coalesce(sum(f.payment_qr), 0),
      coalesce(sum(f.payment_other), 0),
      coalesce(sum(f.payment_delivery_app), 0)
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    GROUP BY 1, f.store_code;

  ELSIF v_mode = 'channel' THEN
    RETURN QUERY
    SELECT
      CASE
        WHEN f.norm_order_type IN ('dine_in', '') THEN 'dine_in'
        WHEN f.norm_order_type IN ('takeout', 'delivery') THEN f.norm_order_type
        ELSE 'unknown'
      END,
      ''::text,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      0::bigint, 0::numeric, 0::bigint, 0::numeric, NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    GROUP BY 1;

  ELSIF v_mode = 'delivery_platform' THEN
    RETURN QUERY
    SELECT
      CASE WHEN btrim(f.delivery_app_code) = '' THEN '_unspecified' ELSE btrim(f.delivery_app_code) END,
      ''::text,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      0::bigint, 0::bigint, 0::numeric, 0::bigint, 0::numeric, NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    WHERE f.norm_order_type = 'delivery'
    GROUP BY 1;

  ELSIF v_mode = 'delivery_payment' THEN
    RETURN QUERY
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
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      sum(f.payment_delivery_app),
      0::bigint, 0::bigint, 0::numeric, 0::bigint, 0::numeric, NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    WHERE coalesce(f.payment_delivery_app, 0) > 0
      AND NOT (
        f.norm_order_type = 'dine_in'
        OR lower(btrim(coalesce(f.delivery_payment_channel, ''))) = 'dine_in'
      )
    GROUP BY 1;

  ELSIF v_mode = 'delivery_app' THEN
    RETURN QUERY
    SELECT
      CASE
        WHEN f.norm_order_type IN ('dine_in', '') THEN 'dine_in'
        WHEN f.norm_order_type IN ('takeout', 'delivery') THEN f.norm_order_type
        ELSE 'unknown'
      END,
      'channel'::text,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      coalesce(sum(f.guest_count), 0)::bigint,
      0::bigint, 0::numeric, 0::bigint, 0::numeric, NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    GROUP BY 1;

    RETURN QUERY
    SELECT
      CASE WHEN btrim(f.delivery_app_code) = '' THEN '_unspecified' ELSE btrim(f.delivery_app_code) END,
      'platform'::text,
      count(*)::bigint,
      sum(f.subtotal), sum(f.vat), sum(f.discount), sum(f.service_amt), sum(f.total),
      0::bigint, 0::bigint, 0::numeric, 0::bigint, 0::numeric, NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM public.pos_sales_analytics_base(
      p_start_utc, p_end_utc_exclusive, v_start, v_end,
      p_store_codes, p_order_types, p_biz_hours, p_tenant_id
    ) f
    WHERE f.norm_order_type = 'delivery'
    GROUP BY 1;

  ELSIF v_mode = 'payment' THEN
    RETURN QUERY
    SELECT p.bucket_key, ''::text, 0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
           p.sales, 0::bigint, 0::bigint, 0::numeric, 0::bigint, 0::numeric,
           p.bucket_key, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM (
      SELECT k AS bucket_key, s AS sales
      FROM (
        SELECT
          coalesce(sum(f.payment_cash), 0) AS cash,
          coalesce(sum(f.payment_card), 0) AS card,
          coalesce(sum(f.payment_qr), 0) AS qr,
          coalesce(sum(f.payment_other), 0) AS other,
          coalesce(sum(f.payment_delivery_app), 0) AS delivery_app
        FROM public.pos_sales_analytics_base(
          p_start_utc, p_end_utc_exclusive, v_start, v_end,
          p_store_codes, p_order_types, p_biz_hours, p_tenant_id
        ) f
      ) t
      CROSS JOIN LATERAL (VALUES
        ('cash', t.cash),
        ('card', t.card),
        ('qr', t.qr),
        ('other', t.other),
        ('delivery_app', t.delivery_app)
      ) v(k, s)
      WHERE s > 0
    ) p;

  ELSIF v_mode = 'menu' THEN
    RETURN QUERY
    SELECT
      mf.menu_name,
      ''::text,
      0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
      sum(mf.sales),
      0::bigint, 0::bigint, 0::numeric, 0::bigint,
      sum(mf.qty),
      NULL::text,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric
    FROM (
      SELECT
        coalesce(nullif(btrim(ml.item->>'name'), ''), '(없음)') AS menu_name,
        greatest(coalesce((ml.item->>'qty')::numeric, 0), 0) AS qty,
        greatest(coalesce((ml.item->>'qty')::numeric, 0), 0)
          * coalesce((ml.item->>'price')::numeric, 0) AS sales
      FROM (
        SELECT elem AS item
        FROM public.pos_sales_analytics_base(
          p_start_utc, p_end_utc_exclusive, v_start, v_end,
          p_store_codes, p_order_types, p_biz_hours, p_tenant_id
        ) f
        INNER JOIN public.pos_orders o ON o.id = f.id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN coalesce(o.items_json, '') ~ '^\s*\['
              THEN coalesce(o.items_json::jsonb, '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) AS elem
      ) ml
      WHERE (
        p_menu_search_tokens IS NULL
        OR coalesce(array_length(p_menu_search_tokens, 1), 0) = 0
        OR (
          CASE
            WHEN coalesce(p_menu_search_and, false) THEN
              NOT EXISTS (
                SELECT 1 FROM unnest(p_menu_search_tokens) tok
                WHERE lower(coalesce(ml.item->>'name', '')) NOT LIKE '%' || lower(tok) || '%'
              )
            ELSE
              EXISTS (
                SELECT 1 FROM unnest(p_menu_search_tokens) tok
                WHERE lower(coalesce(ml.item->>'name', '')) LIKE '%' || lower(tok) || '%'
              )
          END
        )
      )
    ) mf
    GROUP BY mf.menu_name;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_pos_sales_analytics_agg(
  timestamptz, timestamptz, text, text, text[], text[], text, text, jsonb, text[], boolean, text
) IS '매출 관리: store/period/channel/payment/menu 등 DB 집계. 모드별 단일 스캔(57014 완화). Omni는 p_tenant_id로 격리.';

GRANT EXECUTE ON FUNCTION public.get_pos_sales_analytics_agg(
  timestamptz, timestamptz, text, text, text[], text[], text, text, jsonb, text[], boolean, text
) TO anon, authenticated, service_role;

-- 매출 관리 취소사유 집계 RPC — pos_orders 전량+items_json Node 다운로드 없이 DB GROUP BY
-- Supabase SQL Editor에서 실행 후 /api/posCancelReasonSummary 가 RPC 우선 사용.
--
-- 선행: pos_sales_business_ymd_from_clock / pos_sales_is_office_store / pos_sales_order_type_allowed
--       (get_pos_sales_analytics_agg.sql 을 먼저 실행)
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
  WITH hours_global AS MATERIALIZED (
    SELECT
      coalesce((p_biz_hours #>> '{global,startHour}')::int, 8) AS start_hour,
      coalesce((p_biz_hours #>> '{global,startMinute}')::int, 0) AS start_minute,
      coalesce((p_biz_hours #>> '{global,endHour}')::int, 8) AS end_hour,
      coalesce((p_biz_hours #>> '{global,endMinute}')::int, 0) AS end_minute
  ),
  hours_store AS MATERIALIZED (
    SELECT
      public.pos_sales_norm_store_key(kv.key) AS store_key,
      coalesce((kv.value->>'startHour')::int, g.start_hour) AS start_hour,
      coalesce((kv.value->>'startMinute')::int, g.start_minute) AS start_minute,
      coalesce((kv.value->>'endHour')::int, g.end_hour) AS end_hour,
      coalesce((kv.value->>'endMinute')::int, g.end_minute) AS end_minute
    FROM hours_global g
    CROSS JOIN LATERAL jsonb_each(coalesce(p_biz_hours->'stores', '{}'::jsonb)) AS kv(key, value)
  ),
  in_range AS MATERIALIZED (
    SELECT s.*
    FROM (
      SELECT
        o.created_at,
        btrim(coalesce(o.store_code, '')) AS store_code,
        coalesce(o.status, '') AS status,
        coalesce(o.order_type, '') AS order_type,
        coalesce(o.total, 0)::numeric AS total,
        coalesce(o.memo, '') AS memo,
        o.items_json,
        public.pos_sales_business_ymd_from_clock(
          o.created_at,
          coalesce(hs.start_hour, hg.start_hour),
          coalesce(hs.start_minute, hg.start_minute),
          coalesce(hs.end_hour, hg.end_hour),
          coalesce(hs.end_minute, hg.end_minute)
        ) AS biz_ymd
      FROM public.pos_orders o
      CROSS JOIN hours_global hg
      LEFT JOIN hours_store hs
        ON hs.store_key = public.pos_sales_norm_store_key(btrim(coalesce(o.store_code, '')))
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
        AND NOT public.pos_sales_is_office_store(btrim(coalesce(o.store_code, '')))
        AND public.pos_sales_order_type_allowed(o.order_type, p_order_types)
    ) s
    WHERE s.biz_ymd >= p_start_ymd::date
      AND s.biz_ymd <= p_end_ymd::date
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
    WHERE ir.items_json LIKE '%cancelledAt%'
      AND btrim(coalesce(elem->>'cancelledAt', '')) <> ''
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
