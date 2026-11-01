-- Omni 복구(적용): 마루 메뉴 image 가 비어 있고 Storage에 본인 id 파일이 있으면 최신 파일로 복원
-- 02 clear 실행 후 실행
-- 본인 파일이 없으면 비워 둔 채 유지 → 메뉴 화면에서 재업로드

DO $$
DECLARE
  v_prefix text;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not available — skip';
    RETURN;
  END IF;

  SELECT regexp_replace(trim(image), '/[^/]+$', '')
  INTO v_prefix
  FROM public.pos_menus
  WHERE image ILIKE '%.supabase.co/storage/v1/object/public/pos-menu-images%'
    AND trim(coalesce(image, '')) <> ''
  LIMIT 1;

  IF v_prefix IS NULL OR trim(v_prefix) = '' THEN
    v_prefix := 'https://zivwuwwffeqjshcprxlz.supabase.co/storage/v1/object/public/pos-menu-images';
  END IF;

  UPDATE public.pos_menus AS pm
  SET image = matched.hist_image
  FROM (
    SELECT DISTINCT ON (m.id)
      m.id AS menu_id,
      v_prefix || '/' || o.name AS hist_image
    FROM public.pos_menus m
    JOIN storage.objects o
      ON o.bucket_id = 'pos-menu-images'
     AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = m.id
    WHERE lower(btrim(coalesce(m.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
      AND trim(coalesce(m.image, '')) = ''
    ORDER BY m.id, o.name DESC
  ) AS matched
  WHERE pm.id = matched.menu_id
    AND lower(btrim(coalesce(pm.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
    AND trim(coalesce(pm.image, '')) = '';
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_omni_maru_menu_image_cross_03_restore_from_storage.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
