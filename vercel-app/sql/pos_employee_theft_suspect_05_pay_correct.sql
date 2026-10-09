-- 매장 POS 횡령 의심 — 5/6 영수증 결제 정정 (조회 전용)
-- 메모에 [PAY_CORRECT …] 가 찍힌 주문. 합계를 낮추거나 현금을 QR/카드로 바꾼 흔적입니다.
-- 정상 오타 수정도 포함되므로, 현금이 줄고 합계가 내려간 건을 먼저 보세요.

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
  (timezone('Asia/Bangkok', o.updated_at)) AS updated_bkk,
  round(coalesce(o.subtotal, 0)::numeric, 2) AS subtotal,
  round(coalesce(o.discount_amt, 0)::numeric, 2) AS discount_amt,
  round(coalesce(o.total, 0)::numeric, 2) AS total,
  round(coalesce(o.payment_cash, 0)::numeric, 2) AS payment_cash,
  round(coalesce(o.payment_card, 0)::numeric, 2) AS payment_card,
  round(coalesce(o.payment_qr, 0)::numeric, 2) AS payment_qr,
  round(coalesce(o.payment_other, 0)::numeric, 2) AS payment_other,
  round(coalesce(o.payment_delivery_app, 0)::numeric, 2) AS payment_delivery_app,
  o.memo
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
  AND coalesce(o.memo, '') ~ '\[PAY_CORRECT\s'
ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
LIMIT 300;
