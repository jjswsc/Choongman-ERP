-- POS 메뉴 이미지 복구 전 사전 점검 (안전장치)
-- 실행 순서:
-- 1) 이 파일 먼저 실행해 대상·근거를 확인
-- 2) 결과를 확인한 뒤 pos_menu_restore_image_from_audit.sql 실행

-- A) 전체 현황
SELECT
  count(*) AS total_menus,
  count(*) FILTER (WHERE trim(coalesce(image, '')) = '') AS empty_image_menus,
  count(*) FILTER (WHERE image ILIKE '%.supabase.co/storage/%pos-menu-images%') AS supabase_image_menus
FROM public.pos_menus;

-- B) 카테고리별 empty 상위 20
SELECT
  coalesce(nullif(trim(category_main), ''), '(none)') AS category_main,
  count(*) AS empty_cnt
FROM public.pos_menus
WHERE trim(coalesce(image, '')) = ''
GROUP BY 1
ORDER BY empty_cnt DESC, category_main
LIMIT 20;

-- C) 복구 근거별 후보 수 (감사/품목/배달) - 테이블 유무에 따라 0 처리
CREATE TEMP TABLE IF NOT EXISTS _pos_menu_restore_precheck_counts (
  key text primary key,
  value bigint not null
) ON COMMIT DROP;
TRUNCATE _pos_menu_restore_precheck_counts;

INSERT INTO _pos_menu_restore_precheck_counts (key, value)
SELECT 'target_empty', count(*)
FROM public.pos_menus pm
WHERE trim(coalesce(pm.image, '')) = '';

DO $$
BEGIN
  IF to_regclass('public.pos_menu_audit_logs') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO _pos_menu_restore_precheck_counts (key, value)
      SELECT 'audit_candidates', count(DISTINCT l.menu_id)
      FROM public.pos_menu_audit_logs l
      WHERE coalesce(
        nullif(trim(l.before_json->>'imageUrl'), ''),
        nullif(trim(l.before_json->>'image'), ''),
        nullif(trim(l.after_json->>'imageUrl'), ''),
        nullif(trim(l.after_json->>'image'), '')
      ) IS NOT NULL
    $sql$;
  ELSE
    INSERT INTO _pos_menu_restore_precheck_counts (key, value) VALUES ('audit_candidates', 0);
  END IF;

  IF to_regclass('public.items') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO _pos_menu_restore_precheck_counts (key, value)
      SELECT 'items_candidates', count(*)
      FROM public.pos_menus pm
      JOIN public.items i ON lower(trim(pm.code)) = lower(trim(i.code))
      WHERE trim(coalesce(pm.image, '')) = ''
        AND trim(coalesce(i.image, '')) <> ''
    $sql$;
  ELSE
    INSERT INTO _pos_menu_restore_precheck_counts (key, value) VALUES ('items_candidates', 0);
  END IF;

  IF to_regclass('public.pos_delivery_menu_images') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO _pos_menu_restore_precheck_counts (key, value)
      SELECT 'delivery_candidates', count(DISTINCT d.menu_id)
      FROM public.pos_delivery_menu_images d
      WHERE trim(coalesce(d.image_url, '')) <> ''
    $sql$;
  ELSE
    INSERT INTO _pos_menu_restore_precheck_counts (key, value) VALUES ('delivery_candidates', 0);
  END IF;
END $$;

SELECT
  max(value) FILTER (WHERE key = 'target_empty') AS target_empty,
  max(value) FILTER (WHERE key = 'audit_candidates') AS audit_candidates,
  max(value) FILTER (WHERE key = 'items_candidates') AS items_candidates,
  max(value) FILTER (WHERE key = 'delivery_candidates') AS delivery_candidates
FROM _pos_menu_restore_precheck_counts;

-- D) 샘플 50건 (실제 복구 대상 확인)
SELECT id, code, name, category_main, left(trim(coalesce(image, '')), 80) AS image_prefix
FROM public.pos_menus
WHERE trim(coalesce(image, '')) = ''
ORDER BY code NULLS LAST, id
LIMIT 50;

