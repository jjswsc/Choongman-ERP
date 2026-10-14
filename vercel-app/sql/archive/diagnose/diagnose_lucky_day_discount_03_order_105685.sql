-- Lucky Day 누락 후보 1건(CMSEACONSRIN-20260909-042) — 실제 받은 금액 확인
-- 조회 전용. paid_sum = 254 이면 0% 당첨(할인 없음, 정상). 254 미만이면 차액이 통합 할인에서 빠진 금액.
SELECT
  o.id,
  o.order_no,
  o.subtotal,
  o.total,
  o.discount_amt,
  o.discount_reason,
  o.payment_cash,
  o.payment_card,
  o.payment_qr,
  o.payment_other,
  o.payment_delivery_app,
  ROUND(
    COALESCE(o.payment_cash, 0) + COALESCE(o.payment_card, 0) + COALESCE(o.payment_qr, 0)
    + COALESCE(o.payment_other, 0) + COALESCE(o.payment_delivery_app, 0),
    2
  ) AS paid_sum,
  o.items_json
FROM public.pos_orders o
WHERE o.id = 105685;
