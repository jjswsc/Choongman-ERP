-- 미리보기(변경 없음): Grab 웹훅 주문인데 결제가 현금(payment_cash)으로만 잡힌 결제완료 주문 — 최근 14일, 매장별
-- Grab CASH는 손님이 라이더에게 낸 돈이라 매장 서랍 현금이 아니다(Grab 정산으로 입금).
-- auto_paid_orders = 픽업 자동마감(grab_auto_paid)으로 닫힌 건수
SELECT
  o.store_code,
  COUNT(*) AS orders,
  COUNT(*) FILTER (WHERE o.memo ~* 'grab_auto_paid:1') AS auto_paid_orders,
  SUM(o.payment_cash) AS cash_amt,
  MIN(o.created_at AT TIME ZONE 'Asia/Bangkok') AS first_bkk,
  MAX(o.created_at AT TIME ZONE 'Asia/Bangkok') AS last_bkk
FROM public.pos_orders o
WHERE o.created_at >= now() - interval '14 days'
  AND o.memo ILIKE '%grab_order:%'
  AND o.status IN ('paid', 'completed')
  AND COALESCE(o.payment_cash, 0) > 0
  AND COALESCE(o.payment_card, 0) = 0
  AND COALESCE(o.payment_qr, 0) = 0
  AND COALESCE(o.payment_other, 0) = 0
GROUP BY 1
ORDER BY 2 DESC;
