-- 더스트리트: 아직 열려 있는 QR 세션 미리보기 (변경 없음)
SELECT
  s.id AS session_id,
  s.store_code,
  s.table_name,
  s.status AS session_status,
  s.pos_order_id,
  s.created_at AS session_created_at,
  o.order_no,
  o.status AS order_status,
  o.total,
  o.paid_at
FROM public.pos_qr_table_sessions s
LEFT JOIN public.pos_orders o
  ON o.id = s.pos_order_id
WHERE s.status IN ('awaiting_entry', 'active')
  AND (
    s.store_code ILIKE '%the street%'
    OR s.store_code = '1050'
  )
ORDER BY s.table_name, s.id;
