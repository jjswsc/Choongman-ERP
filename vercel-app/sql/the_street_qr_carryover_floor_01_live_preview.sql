-- 1/4 조회 — The Street 지금 손님 있는 QR 홀(6·8) — 변경 없음
-- 기대: pending, paid_at null, active 세션 연결

SELECT
  o.id,
  o.order_no,
  o.table_name,
  o.status,
  o.total,
  o.guest_count,
  o.created_at,
  s.id AS session_id,
  s.status AS session_status
FROM public.pos_orders o
LEFT JOIN public.pos_qr_table_sessions s
  ON s.pos_order_id = o.id
 AND s.status IN ('awaiting_entry', 'active')
WHERE o.id IN (153230, 153231)
ORDER BY o.id;
