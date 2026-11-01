-- Omni 진단(변경 없음): 마루 메뉴인데 이미지 파일명 menu id 가 다른 법인(반주 등) 소유인 행
-- 증상: 메뉴명·카테고리는 마루, 사진은 반주
-- Storage 규칙: {timestamp}-{menuId}_{suffix}

WITH parsed AS (
  SELECT
    m.id,
    m.tenant_id,
    m.code,
    m.name,
    m.category_main,
    m.category,
    m.image,
    (regexp_match(m.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint AS file_menu_id
  FROM public.pos_menus m
  WHERE trim(coalesce(m.image, '')) <> ''
    AND m.image ILIKE '%pos-menu-images%'
    AND lower(btrim(coalesce(m.tenant_id, ''))) IN ('marubkk', 'marubkk_01', 'banjoo')
)
SELECT
  p.tenant_id AS displayed_tenant,
  p.id AS displayed_menu_id,
  p.code,
  p.name,
  p.category_main,
  p.category,
  p.file_menu_id,
  owner.tenant_id AS image_owner_tenant,
  owner.code AS image_owner_code,
  owner.name AS image_owner_name,
  left(p.image, 140) AS image_sample
FROM parsed p
LEFT JOIN public.pos_menus owner ON owner.id = p.file_menu_id
WHERE p.file_menu_id IS NOT NULL
  AND (
    p.file_menu_id <> p.id
    OR lower(btrim(coalesce(owner.tenant_id, ''))) <> lower(btrim(coalesce(p.tenant_id, '')))
  )
ORDER BY p.tenant_id, p.code, p.id;
