-- Grab 「สะสมคะแนน」메뉴 사진 미표시 진단 2/2
-- True(1040) 등 매장별 Grab 배달 이미지 오버라이드
-- Grab 싱크는 policy.imageUrl 우선, 없으면 pos_menus.image 사용

SELECT
  m.id AS menu_id,
  m.name,
  m.code,
  img.store_code,
  img.app_code,
  CASE
    WHEN nullif(trim(img.image_url), '') IS NULL THEN '(empty / no row)'
    WHEN img.image_url ~* '^https?://' THEN 'ok_https'
    ELSE 'invalid_not_http'
  END AS override_image_status,
  left(coalesce(nullif(trim(img.image_url), ''), ''), 120) AS override_image_preview,
  left(coalesce(nullif(trim(m.image), ''), ''), 120) AS menu_image_preview
FROM public.pos_menus m
LEFT JOIN public.pos_delivery_menu_images img
  ON img.menu_id = m.id
 AND img.app_code = 'grab'
WHERE m.name ILIKE '%สะสมคะแนน%'
   OR m.name ILIKE '%สะสมแต้ม%'
   OR m.category ILIKE '%สะสมคะแนน%'
ORDER BY m.id, img.store_code;
