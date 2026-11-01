-- Omni 복구 미리보기(변경 없음): 마루 메뉴 image 가 타 법인 파일인 경우, 감사 before 후보
-- 적용은 fix_omni_maru_menu_image_from_audit_02_apply.sql

WITH mismatched AS (
  SELECT
    m.id,
    m.tenant_id,
    m.code,
    m.name,
    m.image AS current_image,
    (regexp_match(m.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint AS file_menu_id
  FROM public.pos_menus m
  WHERE lower(btrim(coalesce(m.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
    AND trim(coalesce(m.image, '')) <> ''
    AND m.image ILIKE '%pos-menu-images%'
),
targets AS (
  SELECT
    mm.*,
    owner.tenant_id AS image_owner_tenant
  FROM mismatched mm
  LEFT JOIN public.pos_menus owner ON owner.id = mm.file_menu_id
  WHERE mm.file_menu_id IS NOT NULL
    AND (
      mm.file_menu_id <> mm.id
      OR lower(btrim(coalesce(owner.tenant_id, ''))) <> lower(btrim(coalesce(mm.tenant_id, '')))
    )
),
best AS (
  SELECT DISTINCT ON (t.id)
    t.id AS menu_id,
    t.tenant_id,
    t.code,
    t.name,
    t.current_image,
    t.file_menu_id,
    t.image_owner_tenant,
    coalesce(
      nullif(trim(l.before_json->>'imageUrl'), ''),
      nullif(trim(l.before_json->>'image'), '')
    ) AS restore_image
  FROM targets t
  JOIN public.pos_menu_audit_logs l ON l.menu_id = t.id
  WHERE coalesce(
      nullif(trim(l.before_json->>'imageUrl'), ''),
      nullif(trim(l.before_json->>'image'), '')
    ) IS NOT NULL
    AND (
      (regexp_match(
        coalesce(l.before_json->>'imageUrl', l.before_json->>'image'),
        '[0-9]+-([0-9]+)[._]'
      ))[1]::bigint = t.id
      OR coalesce(l.before_json->>'imageUrl', l.before_json->>'image') NOT ILIKE '%pos-menu-images%'
    )
  ORDER BY t.id, l.changed_at DESC
)
SELECT
  menu_id,
  tenant_id,
  code,
  name,
  file_menu_id,
  image_owner_tenant,
  left(current_image, 120) AS current_image_sample,
  left(restore_image, 120) AS restore_image_sample
FROM best
ORDER BY tenant_id, code, menu_id;
