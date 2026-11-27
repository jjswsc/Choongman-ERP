-- POS 채널별 GROSS 집계 (방콕 영업일 기준)
-- 선행 필수: pos_orders_fee_snapshot.sql (card_fee_amt 컬럼)
-- 한 번에 배포: pos_channel_settlement_deploy_one_paste.sql
--
-- 2026-11-27: 웹훅 순액(payment≠subtotal)에 discount를 재차감하지 않음
-- (Shopee 앱 ยอดเงินสุทธิ > POS 마감 AUTO 불일치 수정)

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
            -- payment가 메뉴가(subtotal)와 같을 때만 할인 역산 (웹훅 순액+프로모 이중차감 방지)
            WHEN (
              GREATEST(COALESCE(o.discount_amt, 0), 0)
              + GREATEST(COALESCE(o.coupon_discount_amt, 0), 0)
            ) > 0.005
              AND GREATEST(COALESCE(o.subtotal, 0), 0) > 0.005
              AND ABS(
                GREATEST(COALESCE(o.payment_delivery_app, 0), 0)
                - GREATEST(COALESCE(o.subtotal, 0), 0)
              ) <= 0.02
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

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('get_pos_channel_settlement_gross.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
