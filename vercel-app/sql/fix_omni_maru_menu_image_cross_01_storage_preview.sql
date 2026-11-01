-- Omni 복구 미리보기(변경 없음): 마루 오염 메뉴별 Storage에 본인 id 파일이 있는지
-- 감사 로그(pos_menu_audit_logs) 없는 DB용
-- 다음: 02 clear → 03 storage restore → 04 verify

WITH contaminated AS (
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
  SELECT c.*
  FROM contaminated c
  LEFT JOIN public.pos_menus owner ON owner.id = c.file_menu_id
  WHERE c.file_menu_id IS NOT NULL
    AND (
      c.file_menu_id <> c.id
      OR lower(btrim(coalesce(owner.tenant_id, ''))) <> lower(btrim(coalesce(c.tenant_id, '')))
    )
)
SELECT
  t.id AS menu_id,
  t.tenant_id,
  t.code,
  t.name,
  t.file_menu_id AS wrong_file_menu_id,
  (
    SELECT o.name
    FROM storage.objects o
    WHERE o.bucket_id = 'pos-menu-images'
      AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = t.id
    ORDER BY o.name DESC
    LIMIT 1
  ) AS own_storage_object,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = 'pos-menu-images'
        AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = t.id
    ) THEN 'can_restore_from_storage'
    ELSE 'no_own_file_need_reupload'
  END AS restore_plan,
  left(t.current_image, 100) AS current_image_sample
FROM targets t
ORDER BY t.code, t.id;
