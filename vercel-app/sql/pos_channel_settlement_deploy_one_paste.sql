-- 채널 정산·플랫폼 % 배포 (Supabase SQL Editor에 이 파일만 순서대로 실행)
-- 오류 "column o.card_fee_amt does not exist" → 아래 1)을 먼저 실행하지 않은 경우

-- 1) POS 주문 카드 수수료 스냅샷 컬럼
ALTER TABLE IF EXISTS public.pos_orders
  ADD COLUMN IF NOT EXISTS card_fee_amt NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_mode TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_rate NUMERIC(8, 4) DEFAULT 0;

-- 2) 배달앱 플랫폼 정산 % 컬럼
ALTER TABLE IF EXISTS public.pos_delivery_app_policies
  ADD COLUMN IF NOT EXISTS settlement_fee_pct NUMERIC(5, 2) NULL;

-- 3) 전 매장 Grab 20% / LINE MAN 18% / Shopee 13%
WITH store_list AS (
  SELECT DISTINCT trim(store_code) AS store_code
  FROM (
    SELECT store_code FROM public.erp_stores WHERE coalesce(is_active, true)
    UNION ALL
    SELECT store_code FROM public.pos_delivery_app_policies
    UNION ALL
    SELECT store_code FROM public.pos_orders WHERE trim(coalesce(store_code, '')) <> ''
    UNION ALL
    SELECT trim(store) AS store_code
    FROM public.employees
    WHERE trim(coalesce(store, '')) <> ''
  ) u
  WHERE trim(store_code) <> ''
    AND lower(trim(store_code)) NOT IN ('all', '전체')
),
app_rates (app_code, settlement_fee_pct) AS (
  VALUES
    ('grab', 20.00::numeric),
    ('lineman', 18.00::numeric),
    ('shopee', 13.00::numeric)
)
INSERT INTO public.pos_delivery_app_policies (
  store_code,
  app_code,
  enabled,
  order_acceptance_mode,
  settlement_fee_pct,
  updated_at
)
SELECT
  s.store_code,
  r.app_code,
  true,
  'manual',
  r.settlement_fee_pct,
  now()
FROM store_list s
CROSS JOIN app_rates r
ON CONFLICT (store_code, app_code)
DO UPDATE SET
  settlement_fee_pct = EXCLUDED.settlement_fee_pct,
  updated_at = now();

-- 4) 채널 정산 테이블
CREATE TABLE IF NOT EXISTS public.pos_channel_settlements (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL,
  settle_date DATE NOT NULL,
  channel TEXT NOT NULL,
  gross_amt NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (gross_amt >= 0),
  fee_amt NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (fee_amt >= 0),
  net_amt NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (net_amt >= 0),
  fee_source TEXT NULL,
  memo TEXT NULL,
  bank_transaction_id BIGINT NULL,
  journal_entry_id BIGINT NULL,
  posted_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_code, settle_date, channel)
);

CREATE INDEX IF NOT EXISTS idx_pos_channel_settlements_store_date
  ON public.pos_channel_settlements (store_code, settle_date);

-- 5) GROSS RPC (card_fee_amt 컬럼 필요 → 1) 선행)
CREATE OR REPLACE FUNCTION public.get_pos_channel_settlement_gross(
  p_store_code TEXT,
  p_settle_date DATE,
  p_channel TEXT
)
RETURNS TABLE (
  gross NUMERIC,
  order_count BIGINT,
  card_fee_total NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH orders AS (
    SELECT
      o.payment_card,
      o.payment_delivery_app,
      o.payment_cash,
      o.payment_other,
      o.delivery_app_code,
      o.order_type,
      o.total,
      o.subtotal,
      o.discount_amt,
      o.coupon_discount_amt,
      COALESCE(o.card_fee_amt, 0)::numeric AS card_fee_amt,
      CASE
        WHEN GREATEST(COALESCE(o.payment_delivery_app, 0), 0) > 0 THEN
          CASE
            WHEN GREATEST(COALESCE(o.total, 0), 0) > 0
              AND (
                GREATEST(COALESCE(o.total, 0), 0)
                  < GREATEST(COALESCE(o.payment_delivery_app, 0), 0) - 0.02
                OR GREATEST(COALESCE(o.subtotal, 0), 0)
                  > GREATEST(COALESCE(o.total, 0), 0) + 0.02
              )
            THEN GREATEST(COALESCE(o.total, 0), 0)
            WHEN (
              GREATEST(COALESCE(o.discount_amt, 0), 0)
              + GREATEST(COALESCE(o.coupon_discount_amt, 0), 0)
            ) > 0.005
              AND GREATEST(COALESCE(o.payment_delivery_app, 0), 0)
                > GREATEST(COALESCE(o.discount_amt, 0), 0)
                  + GREATEST(COALESCE(o.coupon_discount_amt, 0), 0)
                  + 0.02
            THEN GREATEST(COALESCE(o.payment_delivery_app, 0), 0)
              - GREATEST(COALESCE(o.discount_amt, 0), 0)
              - GREATEST(COALESCE(o.coupon_discount_amt, 0), 0)
            ELSE GREATEST(COALESCE(o.payment_delivery_app, 0), 0)
          END
        WHEN lower(coalesce(o.order_type, '')) = 'delivery'
          AND lower(coalesce(o.delivery_app_code, '')) <> ''
          AND GREATEST(
            COALESCE(o.payment_other, 0),
            COALESCE(o.payment_cash, 0),
            0
          ) > 0.005
        THEN COALESCE(
          NULLIF(GREATEST(COALESCE(o.total, 0), 0), 0),
          GREATEST(COALESCE(o.payment_other, 0), COALESCE(o.payment_cash, 0), 0)
        )
        ELSE 0::numeric
      END AS delivery_settlement_gross
    FROM public.pos_orders o
    WHERE o.store_code = p_store_code
      AND (o.created_at AT TIME ZONE 'Asia/Bangkok')::date = p_settle_date
      AND lower(coalesce(o.status, '')) IN ('paid', 'preparing', 'cooking', 'ready', 'completed')
  )
  SELECT
    CASE lower(trim(coalesce(p_channel, '')))
      WHEN 'card' THEN COALESCE(SUM(GREATEST(payment_card, 0)), 0)::numeric
      WHEN 'grab' THEN COALESCE(SUM(
        CASE
          WHEN delivery_settlement_gross > 0
            AND lower(coalesce(delivery_app_code, '')) LIKE '%grab%'
          THEN delivery_settlement_gross
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'lineman' THEN COALESCE(SUM(
        CASE
          WHEN delivery_settlement_gross > 0
            AND (
              lower(coalesce(delivery_app_code, '')) LIKE '%line%'
              OR lower(coalesce(delivery_app_code, '')) LIKE '%lineman%'
            )
          THEN delivery_settlement_gross
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'shopee' THEN COALESCE(SUM(
        CASE
          WHEN delivery_settlement_gross > 0
            AND lower(coalesce(delivery_app_code, '')) LIKE '%shopee%'
          THEN delivery_settlement_gross
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'delivery_all' THEN COALESCE(SUM(GREATEST(delivery_settlement_gross, 0)), 0)::numeric
      ELSE 0::numeric
    END AS gross,
    COUNT(*)::bigint AS order_count,
    CASE lower(trim(coalesce(p_channel, '')))
      WHEN 'card' THEN COALESCE(SUM(GREATEST(card_fee_amt, 0)), 0)::numeric
      ELSE 0::numeric
    END AS card_fee_total
  FROM orders;
$$;
