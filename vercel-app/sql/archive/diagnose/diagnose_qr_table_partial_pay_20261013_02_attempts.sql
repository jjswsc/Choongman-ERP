-- 위 주문들의 KBank QR 결제 시도·승인 내역 (조회 전용)
SELECT
  a.order_id,
  a.provider,
  a.tx_code,
  a.status,
  a.request_amount,
  a.approved_amount,
  a.local_tx_id,
  a.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk
FROM public.pos_payment_attempts a
WHERE a.order_id IN (
  SELECT id
  FROM public.pos_orders
  WHERE created_at >= '2026-10-13 00:00:00+07'
    AND created_at < '2026-10-13 06:00:00+07'
    AND table_name = '7'
    AND created_by LIKE 'qr_table%'
)
ORDER BY a.created_at;
