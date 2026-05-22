-- POS 채널별 GROSS 집계 (방콕 영업일 기준)
-- 선행 필수: pos_orders_fee_snapshot.sql (card_fee_amt 컬럼)
-- 한 번에 배포: pos_channel_settlement_deploy_one_paste.sql

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
      o.delivery_app_code,
      COALESCE(o.card_fee_amt, 0)::numeric AS card_fee_amt
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
          WHEN GREATEST(payment_delivery_app, 0) > 0
            AND lower(coalesce(delivery_app_code, '')) LIKE '%grab%'
          THEN GREATEST(payment_delivery_app, 0)
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'lineman' THEN COALESCE(SUM(
        CASE
          WHEN GREATEST(payment_delivery_app, 0) > 0
            AND (
              lower(coalesce(delivery_app_code, '')) LIKE '%line%'
              OR lower(coalesce(delivery_app_code, '')) LIKE '%lineman%'
            )
          THEN GREATEST(payment_delivery_app, 0)
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'shopee' THEN COALESCE(SUM(
        CASE
          WHEN GREATEST(payment_delivery_app, 0) > 0
            AND lower(coalesce(delivery_app_code, '')) LIKE '%shopee%'
          THEN GREATEST(payment_delivery_app, 0)
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'delivery_all' THEN COALESCE(SUM(GREATEST(payment_delivery_app, 0)), 0)::numeric
      ELSE 0::numeric
    END AS gross,
    COUNT(*)::bigint AS order_count,
    CASE lower(trim(coalesce(p_channel, '')))
      WHEN 'card' THEN COALESCE(SUM(GREATEST(card_fee_amt, 0)), 0)::numeric
      ELSE 0::numeric
    END AS card_fee_total
  FROM orders;
$$;
