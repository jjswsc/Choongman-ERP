-- 에까마이 매장 POS 단말 역할(메인/주문)·잠금 상태 확인 (조회 전용)
SELECT
  d.store_code,
  d.role,
  d.display_label,
  left(d.device_token, 6) || '…' || right(d.device_token, 4) AS device_id,
  (d.created_at AT TIME ZONE 'Asia/Bangkok')::timestamp(0) AS created_bkk,
  (d.last_seen_at AT TIME ZONE 'Asia/Bangkok')::timestamp(0) AS last_seen_bkk,
  left(coalesce(d.client_hint, ''), 80) AS client_hint,
  s.main_device_role_locked,
  s.main_device_max_count,
  s.order_device_max_count
FROM public.pos_connected_devices d
LEFT JOIN public.pos_printer_settings s ON s.store_code = d.store_code
WHERE d.store_code ILIKE '%ekkamai%'
ORDER BY d.last_seen_at DESC
LIMIT 30;
