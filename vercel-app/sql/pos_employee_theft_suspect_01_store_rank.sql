-- 매장 POS 횡령 의심 — 1/6 매장별 요약 (조회 전용, 영업 중 실행 가능)
-- 방콕시간 최근 90일. 특정 매장만 보려면 store_code 를 'CM Asoke' 처럼 넣으세요.
-- 합석 흡수([ORDER_MERGED])·본사성 매장·배달앱 고객취소는 제외합니다.
-- 숫자가 크다고 바로 절도가 아닙니다. 2~6번으로 건별 확인하세요.

WITH params AS (
  SELECT
    ((timezone('Asia/Bangkok', now()))::date - 90) AS start_ymd,
    (timezone('Asia/Bangkok', now()))::date AS end_ymd,
    NULL::text AS store_code
),
base AS (
  SELECT
    o.id,
    btrim(coalesce(o.store_code, '')) AS store_code,
    lower(btrim(coalesce(o.status, ''))) AS status,
    lower(btrim(coalesce(o.order_type, ''))) AS order_type,
    coalesce(o.total, 0)::numeric AS total,
    coalesce(o.discount_amt, 0)::numeric AS discount_amt,
    coalesce(o.coupon_discount_amt, 0)::numeric AS coupon_discount_amt,
    coalesce(o.collab_discount_amt, 0)::numeric AS collab_discount_amt,
    coalesce(o.tier_discount_amt, 0)::numeric AS tier_discount_amt,
    coalesce(o.service_amt, 0)::numeric AS service_amt,
    coalesce(o.payment_cash, 0)::numeric AS payment_cash,
    (
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
      + coalesce(o.payment_delivery_app, 0)
    )::numeric AS payment_sum,
    o.paid_at,
    coalesce(o.memo, '') AS memo,
    coalesce(o.delivery_app_code, '') AS delivery_app_code,
    coalesce(o.items_json::text, '') AS items_text
  FROM public.pos_orders o
  CROSS JOIN params p
  WHERE o.created_at >= (p.start_ymd::text || 'T00:00:00+07:00')::timestamptz
    AND o.created_at < ((p.end_ymd + 1)::text || 'T00:00:00+07:00')::timestamptz
    AND (
      p.store_code IS NULL
      OR btrim(p.store_code) = ''
      OR btrim(coalesce(o.store_code, '')) = btrim(p.store_code)
    )
    AND btrim(coalesce(o.store_code, '')) !~* '(office|본사|^hq$)'
    AND coalesce(o.memo, '') !~ '\[ORDER_MERGED\s'
),
flagged AS (
  SELECT
    b.*,
    greatest(
      0::numeric,
      b.discount_amt - b.coupon_discount_amt - b.collab_discount_amt - b.tier_discount_amt
    ) AS manual_discount,
    (b.status IN ('cancelled', 'canceled', 'refunded')) AS is_cancel,
    (b.paid_at IS NOT NULL OR b.payment_sum > 0.5) AS had_payment,
    (b.order_type IN ('dine-in', 'dine_in', 'dinein', 'takeout', 'take-out', 'take_out')
      OR b.order_type = '') AS is_storefront,
    (b.delivery_app_code <> '' OR b.order_type IN ('delivery', 'grab', 'lineman', 'shopee')) AS is_app,
    (b.memo ~ '\[PAY_CORRECT\s') AS is_pay_correct,
    (b.items_text LIKE '%servedAt%' OR b.items_text LIKE '%served_at%') AS had_served
  FROM base b
)
SELECT
  store_code,
  count(*) FILTER (
    WHERE is_cancel AND had_payment AND NOT is_app
  ) AS paid_then_cancel_cnt,
  round(sum(total) FILTER (
    WHERE is_cancel AND had_payment AND NOT is_app
  )::numeric, 2) AS paid_then_cancel_amt,
  count(*) FILTER (
    WHERE is_cancel AND had_payment AND payment_cash > 0.5 AND NOT is_app
  ) AS cash_paid_then_cancel_cnt,
  round(sum(payment_cash) FILTER (
    WHERE is_cancel AND had_payment AND payment_cash > 0.5 AND NOT is_app
  )::numeric, 2) AS cash_paid_then_cancel_amt,
  count(*) FILTER (
    WHERE is_cancel AND NOT had_payment AND is_storefront AND NOT is_app
      AND (had_served OR total >= 100)
  ) AS unpaid_cancel_cnt,
  round(sum(total) FILTER (
    WHERE is_cancel AND NOT had_payment AND is_storefront AND NOT is_app
      AND (had_served OR total >= 100)
  )::numeric, 2) AS unpaid_cancel_amt,
  count(*) FILTER (
    WHERE status IN ('paid', 'completed', 'ready', 'cooking')
      AND greatest(0::numeric, discount_amt - coupon_discount_amt - collab_discount_amt - tier_discount_amt) >= 100
  ) AS big_manual_discount_cnt,
  round(sum(greatest(0::numeric, discount_amt - coupon_discount_amt - collab_discount_amt - tier_discount_amt)) FILTER (
    WHERE status IN ('paid', 'completed', 'ready', 'cooking')
      AND greatest(0::numeric, discount_amt - coupon_discount_amt - collab_discount_amt - tier_discount_amt) >= 100
  )::numeric, 2) AS big_manual_discount_amt,
  count(*) FILTER (
    WHERE status IN ('paid', 'completed', 'ready', 'cooking') AND service_amt >= 50
  ) AS service_comp_cnt,
  round(sum(service_amt) FILTER (
    WHERE status IN ('paid', 'completed', 'ready', 'cooking') AND service_amt >= 50
  )::numeric, 2) AS service_comp_amt,
  count(*) FILTER (WHERE is_pay_correct) AS pay_correct_cnt
FROM flagged
GROUP BY store_code
HAVING
  count(*) FILTER (WHERE is_cancel AND had_payment AND NOT is_app) > 0
  OR count(*) FILTER (
    WHERE is_cancel AND NOT had_payment AND is_storefront AND NOT is_app
      AND (had_served OR total >= 100)
  ) > 0
  OR count(*) FILTER (
    WHERE status IN ('paid', 'completed', 'ready', 'cooking')
      AND greatest(0::numeric, discount_amt - coupon_discount_amt - collab_discount_amt - tier_discount_amt) >= 100
  ) > 0
  OR count(*) FILTER (
    WHERE status IN ('paid', 'completed', 'ready', 'cooking') AND service_amt >= 50
  ) > 0
  OR count(*) FILTER (WHERE is_pay_correct) > 0
ORDER BY
  cash_paid_then_cancel_amt DESC NULLS LAST,
  paid_then_cancel_amt DESC NULLS LAST,
  unpaid_cancel_amt DESC NULLS LAST,
  big_manual_discount_amt DESC NULLS LAST;
