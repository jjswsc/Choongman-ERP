-- 매장 POS 횡령 의심 — 2/6 결제 후 취소 (조회 전용)
-- 손님에게 받은 뒤 POS에서 매출을 지우는 패턴. 현금(payment_cash)이 있으면 우선 보세요.
-- 합석 흡수·배달앱은 제외. 기간·매장은 params 만 바꾸면 됩니다.

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
  (timezone('Asia/Bangkok', o.paid_at)) AS paid_bkk,
  (timezone('Asia/Bangkok', o.updated_at)) AS updated_bkk,
  round(coalesce(o.total, 0)::numeric, 2) AS total,
  round(coalesce(o.payment_cash, 0)::numeric, 2) AS payment_cash,
  round(coalesce(o.payment_card, 0)::numeric, 2) AS payment_card,
  round(coalesce(o.payment_qr, 0)::numeric, 2) AS payment_qr,
  round(coalesce(o.payment_other, 0)::numeric, 2) AS payment_other,
  round(coalesce(o.payment_delivery_app, 0)::numeric, 2) AS payment_delivery_app,
  round((
    coalesce(o.payment_cash, 0)
    + coalesce(o.payment_card, 0)
    + coalesce(o.payment_qr, 0)
    + coalesce(o.payment_other, 0)
    + coalesce(o.payment_delivery_app, 0)
  )::numeric, 2) AS payment_sum,
  left(coalesce(o.memo, ''), 240) AS memo_head
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
  AND lower(btrim(coalesce(o.status, ''))) IN ('cancelled', 'canceled', 'refunded')
  AND coalesce(o.memo, '') !~ '\[ORDER_MERGED\s'
  AND coalesce(o.delivery_app_code, '') = ''
  AND lower(btrim(coalesce(o.order_type, ''))) NOT IN ('delivery', 'grab', 'lineman', 'shopee')
  AND (
    o.paid_at IS NOT NULL
    OR (
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
      + coalesce(o.payment_delivery_app, 0)
    ) > 0.5
  )
ORDER BY
  coalesce(o.payment_cash, 0) DESC,
  coalesce(o.total, 0) DESC,
  o.created_at DESC
LIMIT 300;
