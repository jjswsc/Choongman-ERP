-- True Digital(1040 / CM True Digital) Grab 배달 이미지·정책 유무
-- 메뉴 471 สะสมคะแนน — 전 매장 menu.image는 있어도 매장별 override는 Bangna만 있을 수 있음

SELECT
  'menu' AS src,
  m.id::text AS key,
  left(coalesce(m.image, ''), 160) AS url_or_note
FROM public.pos_menus m
WHERE m.id = 471

UNION ALL

SELECT
  'grab_image_' || coalesce(img.store_code, '(null)'),
  img.menu_id::text,
  left(coalesce(img.image_url, ''), 160)
FROM public.pos_delivery_menu_images img
WHERE img.menu_id = 471
  AND img.app_code = 'grab'

UNION ALL

SELECT
  'grab_policy_' || coalesce(p.store_code, '(null)'),
  p.menu_id::text,
  'enabled=' || coalesce(p.enabled::text, 'null')
    || ' sold_out=' || coalesce(p.sold_out::text, 'null')
FROM public.pos_delivery_menu_policies p
WHERE p.menu_id = 471
  AND p.app_code = 'grab'
ORDER BY 1;
