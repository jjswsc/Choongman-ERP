-- Omni 복구(적용): 마루(marubkk*) 메뉴 image 가 반주 등 타 법인 파일인 URL만 비움
-- 반주(banjoo) 행은 수정하지 않음
-- 미리보기: fix_omni_maru_menu_image_cross_01_storage_preview.sql
-- 다음: 03 storage restore

UPDATE public.pos_menus AS pm
SET image = ''
WHERE lower(btrim(coalesce(pm.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
  AND trim(coalesce(pm.image, '')) <> ''
  AND pm.image ILIKE '%pos-menu-images%'
  AND (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint IS NOT NULL
  AND (
    (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint <> pm.id
    OR EXISTS (
      SELECT 1
      FROM public.pos_menus owner
      WHERE owner.id = (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint
        AND lower(btrim(coalesce(owner.tenant_id, ''))) <> lower(btrim(coalesce(pm.tenant_id, '')))
    )
  );

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_omni_maru_menu_image_cross_02_clear_banjoo_urls.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
