-- 2b/4 조회 — 6·8 created_at 당김 확인 (변경 없음)
-- 기대: created_at 이 방금(now 근처), status=pending, session active

SELECT
  o.id,
  o.order_no,
  o.table_name,
  o.status,
  o.total,
  o.created_at,
  o.updated_at,
  s.id AS session_id,
  s.status AS session_status
FROM public.pos_orders o
LEFT JOIN public.pos_qr_table_sessions s
  ON s.pos_order_id = o.id
 AND s.status IN ('awaiting_entry', 'active')
WHERE o.id IN (153230, 153231)
ORDER BY o.id;
