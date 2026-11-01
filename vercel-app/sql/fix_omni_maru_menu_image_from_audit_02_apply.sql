-- Omni 복구(적용): 마루 메뉴 image 가 타 법인 Storage 파일인 행만, 감사 before URL 로 되돌림
-- ⚠ 미리보기 fix_omni_maru_menu_image_from_audit_01_preview.sql 결과 확인 후 실행
-- 반주(banjoo) 행은 절대 수정하지 않음
-- 영업 중 POS 켜진 상태에서도 pos_menus.image 만 바꾸며 Realtime 결제 재인쇄와는 무관

WITH mismatched AS (
  SELECT
    m.id,
    m.tenant_id,
    m.image AS current_image,
    (regexp_match(m.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint AS file_menu_id
  FROM public.pos_menus m
  WHERE lower(btrim(coalesce(m.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
    AND trim(coalesce(m.image, '')) <> ''
    AND m.image ILIKE '%pos-menu-images%'
),
targets AS (
  SELECT
    mm.*
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
UPDATE public.pos_menus AS pm
SET image = best.restore_image
FROM best
WHERE pm.id = best.menu_id
  AND lower(btrim(coalesce(pm.tenant_id, ''))) IN ('marubkk', 'marubkk_01')
  AND trim(coalesce(best.restore_image, '')) <> ''
  AND trim(coalesce(pm.image, '')) IS DISTINCT FROM trim(best.restore_image);

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_omni_maru_menu_image_from_audit_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
