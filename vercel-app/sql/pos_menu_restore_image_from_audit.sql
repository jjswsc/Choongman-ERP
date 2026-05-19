-- pos_menus.image 가 비었을 때 복구 (감사·items·배달·Storage)
-- ⚠ 치킨 사진이 엉뚱한 메뉴로 붙었을 때는 이 파일 대신 pos_menu_fix_chicken_images_strict.sql 사용
--    (코드/감사/items 매칭은 잘못된 URL 을 다시 붙일 수 있음)
-- 실행 순서:
-- 1) pos_menu_restore_image_precheck.sql (대상/근거 사전 점검)
-- 2) pos_menu_chicken_image_audit_diagnostic.sql 로 B~E 확인
-- 3) 이 파일 실행

-- 공개 URL 접두어 (프로젝트에 맞게 1행만 있으면 자동)
CREATE TEMP TABLE IF NOT EXISTS _pos_menu_image_public_base (prefix text) ON COMMIT DROP;
TRUNCATE _pos_menu_image_public_base;
INSERT INTO _pos_menu_image_public_base (prefix)
SELECT regexp_replace(trim(image), '/[^/]+$', '')
FROM public.pos_menus
WHERE image ILIKE '%.supabase.co/storage/v1/object/public/pos-menu-images%'
  AND trim(coalesce(image, '')) <> ''
LIMIT 1;

-- 1) 감사 로그: before / after / changed_fields(imageUrl) 중 가장 최근 비어 있지 않은 URL
DO $$
BEGIN
  IF to_regclass('public.pos_menu_audit_logs') IS NOT NULL THEN
    EXECUTE $sql$
      WITH candidates AS (
        SELECT
          l.menu_id,
          l.changed_at,
          coalesce(
            nullif(trim(l.before_json->>'imageUrl'), ''),
            nullif(trim(l.before_json->>'image'), ''),
            nullif(trim(l.after_json->>'imageUrl'), ''),
            nullif(trim(l.after_json->>'image'), ''),
            nullif(trim(cf.elem->>'before'), ''),
            nullif(trim(cf.elem->>'after'), '')
          ) AS hist_image
        FROM public.pos_menu_audit_logs l
        LEFT JOIN LATERAL jsonb_array_elements(coalesce(l.changed_fields_json, '[]'::jsonb)) cf(elem)
          ON cf.elem->>'field' IN ('imageUrl', 'image')
      ),
      best AS (
        SELECT DISTINCT ON (menu_id)
          menu_id,
          hist_image
        FROM candidates
        WHERE hist_image IS NOT NULL
          AND hist_image NOT IN ('null', '__NULL__')
        ORDER BY menu_id, changed_at DESC
      )
      UPDATE public.pos_menus AS pm
      SET image = best.hist_image
      FROM best
      WHERE pm.id = best.menu_id
        AND trim(coalesce(pm.image, '')) = ''
    $sql$;
  END IF;
END $$;

-- 2) 품목 마스터 items (동일 code)
DO $$
BEGIN
  IF to_regclass('public.items') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.pos_menus AS pm
      SET image = trim(i.image)
      FROM public.items AS i
      WHERE trim(coalesce(pm.image, '')) = ''
        AND trim(coalesce(i.image, '')) <> ''
        AND lower(trim(pm.code)) = lower(trim(i.code))
    $sql$;
  END IF;
END $$;

-- 3) 배달 앱 메뉴 이미지 override (메뉴당 1건)
DO $$
BEGIN
  IF to_regclass('public.pos_delivery_menu_images') IS NOT NULL THEN
    EXECUTE $sql$
      WITH best AS (
        SELECT DISTINCT ON (menu_id)
          menu_id,
          trim(image_url) AS hist_image
        FROM public.pos_delivery_menu_images
        WHERE trim(coalesce(image_url, '')) <> ''
        ORDER BY menu_id, updated_at DESC NULLS LAST, id DESC
      )
      UPDATE public.pos_menus AS pm
      SET image = best.hist_image
      FROM best
      WHERE pm.id = best.menu_id
        AND trim(coalesce(pm.image, '')) = ''
    $sql$;
  END IF;
END $$;

-- 4) Storage 객체 이름 ↔ menu id / code (C024: ...-76_B 형태)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _pos_menu_image_public_base WHERE trim(coalesce(prefix, '')) <> '') THEN
    EXECUTE $sql$
      WITH base AS (
        SELECT prefix FROM _pos_menu_image_public_base WHERE trim(coalesce(prefix, '')) <> '' LIMIT 1
      ),
      matched AS (
        SELECT DISTINCT ON (pm.id)
          pm.id AS menu_id,
          b.prefix || '/' || o.name AS hist_image
        FROM public.pos_menus pm
        CROSS JOIN base b
        JOIN storage.objects o
          ON o.bucket_id = 'pos-menu-images'
         AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = pm.id
        WHERE trim(coalesce(pm.image, '')) = ''
        ORDER BY pm.id, o.name DESC
      )
      UPDATE public.pos_menus AS pm
      SET image = matched.hist_image
      FROM matched
      WHERE pm.id = matched.menu_id
        AND trim(coalesce(pm.image, '')) = ''
    $sql$;
  END IF;
END $$;

-- 확인
SELECT
  code,
  name,
  CASE
    WHEN trim(coalesce(image, '')) = '' THEN 'empty'
    WHEN image ILIKE '%.supabase.co/storage/%' THEN 'supabase_storage'
    ELSE 'other_url'
  END AS image_kind,
  left(trim(image), 100) AS image_prefix
FROM public.pos_menus
WHERE lower(coalesce(code, '')) LIKE 'c%'
ORDER BY code;
