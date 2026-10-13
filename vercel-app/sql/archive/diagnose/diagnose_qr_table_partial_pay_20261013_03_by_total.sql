-- 2026-10-13 새벽 합계 518 주문 — 테이블명·created_by 조건 없이 금액으로 찾기 (조회 전용)
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
  paid_at AT TIME ZONE 'Asia/Bangkok' AS paid_bkk
FROM public.pos_orders
WHERE created_at >= '2026-10-12 22:00:00+07'
  AND created_at < '2026-10-13 06:00:00+07'
  AND (total BETWEEN 517 AND 519 OR payment_qr BETWEEN 397 AND 399)
ORDER BY created_at;
