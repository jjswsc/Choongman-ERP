-- 미리보기만 (변경 없음)
-- Bangna에만 있는 471 Grab 이미지를, 정책이 있는 다른 매장에도 복사할지 대상 확인

SELECT
  p.store_code,
  CASE WHEN img.menu_id IS NULL THEN 'NEED_COPY' ELSE 'HAS_IMAGE' END AS image_row,
  left(coalesce(img.image_url, m.image, ''), 120) AS current_or_menu_url
FROM public.pos_delivery_menu_policies p
JOIN public.pos_menus m ON m.id = p.menu_id
LEFT JOIN public.pos_delivery_menu_images img
  ON img.menu_id = p.menu_id
 AND img.store_code = p.store_code
 AND img.app_code = 'grab'
WHERE p.menu_id = 471
  AND p.app_code = 'grab'
ORDER BY p.store_code;
