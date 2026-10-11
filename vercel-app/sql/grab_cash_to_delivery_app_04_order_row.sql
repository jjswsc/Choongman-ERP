-- 확인(변경 없음): 에까마이 GF-513(Grab ID …LWTVEVJE) 주문의 현재 결제 필드
SELECT
  o.id,
  o.order_no,
  o.store_code,
  o.status,
  o.total,
  o.payment_cash,
  o.payment_cash_tendered,
  o.payment_card,
  o.payment_qr,
  o.payment_other,
  o.payment_delivery_app,
  o.delivery_payment_channel,
  o.delivery_app_code,
  o.paid_at AT TIME ZONE 'Asia/Bangkok' AS paid_bkk,
  o.memo
FROM public.pos_orders o
WHERE o.table_name ILIKE '%LWTVEVJE%'
  AND o.created_at >= now() - interval '3 days';
