-- Omni 진단(변경 없음): 마루 메뉴 중 image 비어 있는 목록 (재업로드 대상)

SELECT
  id AS menu_id,
  code,
  name,
  category_main,
  category,
  CASE WHEN is_active IS FALSE THEN 'inactive' ELSE 'active' END AS status
FROM public.pos_menus
WHERE lower(btrim(coalesce(tenant_id, ''))) IN ('marubkk', 'marubkk_01')
  AND trim(coalesce(image, '')) = ''
ORDER BY category_main, category, code, id;
