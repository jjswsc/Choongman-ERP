-- Seacon QR 설정·현재 숨김 메뉴 (읽기 전용)
-- 매장 코드 표기가 다르면 아래 ILIKE로 잡힘

SELECT
  s.store_code,
  s.enabled AS qr_enabled,
  coalesce(cardinality(s.hidden_menu_ids), 0) AS hidden_count,
  s.hidden_menu_ids,
  (
    SELECT string_agg(m.name || ' (#' || m.id || ')', ', ' ORDER BY m.id)
    FROM public.pos_menus m
    WHERE m.id = ANY (s.hidden_menu_ids)
      AND (
        m.name ILIKE '%Good Morning%'
        OR m.name ILIKE '%Morning Deal%'
      )
  ) AS already_hidden_good_morning
FROM public.pos_qr_order_store_settings s
WHERE s.store_code ILIKE 'CM Seacon%'
   OR s.store_code ILIKE '%Seacon Srinakarin%'
ORDER BY s.store_code;
