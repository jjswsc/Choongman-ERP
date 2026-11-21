-- Seacon QR 숨김 적용 후 확인 (읽기 전용)

SELECT
  s.store_code,
  m.id AS menu_id,
  m.code,
  m.name,
  m.price,
  (m.id = ANY (coalesce(s.hidden_menu_ids, '{}'::bigint[]))) AS hidden_on_seacon_qr
FROM public.pos_qr_order_store_settings s
CROSS JOIN public.pos_menus m
WHERE (
    s.store_code ILIKE 'CM Seacon%'
    OR s.store_code ILIKE '%Seacon Srinakarin%'
  )
  AND m.is_active IS DISTINCT FROM false
  AND (
    m.name ILIKE '%Good Morning%'
    OR m.name ILIKE '%Morning Deal%'
  )
ORDER BY s.store_code, m.price, m.id;
