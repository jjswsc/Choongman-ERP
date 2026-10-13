-- 2026-10-13 새벽 QR 테이블 7번: 손님 QR 398 + 추가 음료 120 — 주문 결제 필드 확인 (조회 전용)
SELECT
  id,
  store_code,
  order_no,
  table_name,
  status,
  total,
  payment_qr,
  payment_cash,
  payment_card,
  payment_other,
  created_by,
  created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  paid_at AT TIME ZONE 'Asia/Bangkok' AS paid_bkk,
  updated_at AT TIME ZONE 'Asia/Bangkok' AS updated_bkk
FROM public.pos_orders
WHERE created_at >= '2026-10-13 00:00:00+07'
  AND created_at < '2026-10-13 06:00:00+07'
  AND table_name = '7'
  AND created_by LIKE 'qr_table%'
ORDER BY created_at;
