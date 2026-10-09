-- 매장 POS 횡령 의심 — 4/6 수동 할인·서비스(컴) (조회 전용)
-- 쿠폰·협업·등급 할인을 뺀 나머지 할인, 또는 service_amt(서비스/컴)가 큰 완료성 주문.
-- 정상 직원식·본사 승인 할인도 같이 잡히므로 사유(discount_reason / service_reason)를 같이 보세요.

WITH params AS (
  SELECT
    ((timezone('Asia/Bangkok', now()))::date - 90) AS start_ymd,
    (timezone('Asia/Bangkok', now()))::date AS end_ymd,
    NULL::text AS store_code
)
SELECT
  o.id,
  o.order_no,
  o.store_code,
  o.order_type,
  o.status,
  o.created_by,
  (timezone('Asia/Bangkok', o.created_at)) AS created_bkk,
  round(coalesce(o.subtotal, 0)::numeric, 2) AS subtotal,
  round(coalesce(o.total, 0)::numeric, 2) AS total,
  round(coalesce(o.discount_amt, 0)::numeric, 2) AS discount_amt,
  round(coalesce(o.coupon_discount_amt, 0)::numeric, 2) AS coupon_discount_amt,
  round(coalesce(o.collab_discount_amt, 0)::numeric, 2) AS collab_discount_amt,
  round(coalesce(o.tier_discount_amt, 0)::numeric, 2) AS tier_discount_amt,
  round(greatest(
    0::numeric,
    coalesce(o.discount_amt, 0)
      - coalesce(o.coupon_discount_amt, 0)
      - coalesce(o.collab_discount_amt, 0)
      - coalesce(o.tier_discount_amt, 0)
  )::numeric, 2) AS manual_discount,
  round(coalesce(o.service_amt, 0)::numeric, 2) AS service_amt,
  round(coalesce(o.payment_cash, 0)::numeric, 2) AS payment_cash,
  left(coalesce(o.discount_reason, ''), 120) AS discount_reason,
  left(coalesce(o.service_reason, ''), 120) AS service_reason
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
  AND lower(btrim(coalesce(o.status, ''))) IN ('paid', 'completed', 'ready', 'cooking')
  AND (
    greatest(
      0::numeric,
      coalesce(o.discount_amt, 0)
        - coalesce(o.coupon_discount_amt, 0)
        - coalesce(o.collab_discount_amt, 0)
        - coalesce(o.tier_discount_amt, 0)
    ) >= 100
    OR coalesce(o.service_amt, 0) >= 50
  )
ORDER BY
  greatest(
    greatest(
      0::numeric,
      coalesce(o.discount_amt, 0)
        - coalesce(o.coupon_discount_amt, 0)
        - coalesce(o.collab_discount_amt, 0)
        - coalesce(o.tier_discount_amt, 0)
    ),
    coalesce(o.service_amt, 0)
  ) DESC,
  o.created_at DESC
LIMIT 300;
