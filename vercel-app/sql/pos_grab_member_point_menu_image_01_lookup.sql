-- Grab 「สะสมคะแนน」메뉴 사진 미표시 진단 1/2
-- POS 메뉴·배달 이미지 오버라이드에 https URL이 있는지 확인
-- (photos 비어 있으면 Grab 손님 앱에 썸네일이 안 나옴)

SELECT
  m.id,
  m.code,
  m.name,
  m.category,
  m.category_main,
  m.price,
  m.price_delivery,
  m.is_active,
  m.sell_delivery,
  CASE
    WHEN nullif(trim(m.image), '') IS NULL THEN '(empty)'
    WHEN m.image ~* '^https?://' THEN 'ok_https'
    ELSE 'invalid_not_http'
  END AS menu_image_status,
  left(coalesce(nullif(trim(m.image), ''), ''), 120) AS menu_image_preview
FROM public.pos_menus m
WHERE m.name ILIKE '%สะสมคะแนน%'
   OR m.name ILIKE '%สะสมแต้ม%'
   OR m.name ILIKE '%Member%'
   OR m.category ILIKE '%สะสมคะแนน%'
   OR m.category ILIKE '%Member%'
ORDER BY m.id;
