-- 잔여 2건(및 동일 패턴) payment_qr·created_at 보정 결과 확인
SELECT
  o.id AS order_id,
  o.order_no,
  o.status,
  o.total,
  o.payment_qr,
  o.payment_cash,
  o.payment_card,
  o.payment_other,
  o.created_at,
  o.paid_at,
  (o.created_at - o.paid_at) AS created_minus_paid
FROM public.pos_orders o
WHERE o.id IN (119352, 117949)
ORDER BY o.id DESC;
