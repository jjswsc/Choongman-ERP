-- Omni 진단(변경 없음): 마루 교차 오염 목록 + 복구 경로 안내
-- Omni에 pos_menu_audit_logs 가 없으면 감사 복구 불가 → Storage 경로 사용
-- 다음: fix_omni_maru_menu_image_cross_01_storage_preview.sql

SELECT
  to_regclass('public.pos_menu_audit_logs') IS NOT NULL AS audit_table_exists,
  count(*) AS contaminated_maru_rows,
  'use fix_omni_maru_menu_image_cross_01_storage_preview.sql' AS next_step
FROM public.pos_menus m
LEFT JOIN public.pos_menus owner
  ON owner.id = (regexp_match(m.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint
WHERE lower(btrim(coalesce(m.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
  AND trim(coalesce(m.image, '')) <> ''
  AND m.image ILIKE '%pos-menu-images%'
  AND (regexp_match(m.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint IS NOT NULL
  AND (
    (regexp_match(m.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint <> m.id
    OR lower(btrim(coalesce(owner.tenant_id, ''))) <> lower(btrim(coalesce(m.tenant_id, '')))
  );
