-- C013, C020~C023 등 image 가 아직 empty 인 치킨 메뉴 추가 복구
-- ⚠ 사진이 다른 메뉴로 보이면 pos_menu_fix_chicken_images_strict.sql 먼저 실행
-- (파일명 패턴: 1774343948409-27._G / 1777969760600-76_B → 타임스탬프-메뉴id)

-- 0) 대상 메뉴 id · Storage 후보 미리보기
SELECT
  pm.code,
  pm.name,
  pm.id AS menu_id,
  o.name AS storage_object,
  left(
    (SELECT prefix FROM (
      SELECT regexp_replace(trim(image), '/[^/]+$', '') AS prefix
      FROM public.pos_menus
      WHERE image ILIKE '%.supabase.co/storage/v1/object/public/pos-menu-images%'
      LIMIT 1
    ) b) || '/' || o.name,
    110
  ) AS would_set_url
FROM public.pos_menus pm
LEFT JOIN storage.objects o
  ON o.bucket_id = 'pos-menu-images'
 AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = pm.id
WHERE trim(coalesce(pm.image, '')) = ''
  AND lower(coalesce(pm.code, '')) IN (
    'c013', 'c020', 'c021', 'c022', 'c023'
  )
ORDER BY pm.code, o.name DESC;

-- 1) 감사 로그(과거 imageUrl / changed_fields) — 위에서 storage 가 0건일 때
DO $$
BEGIN
  IF to_regclass('public.pos_menu_audit_logs') IS NOT NULL THEN
    EXECUTE $sql$
      WITH targets AS (
        SELECT id, code
        FROM public.pos_menus
        WHERE trim(coalesce(image, '')) = ''
          AND lower(trim(code)) IN ('c013', 'c020', 'c021', 'c022', 'c023')
      ),
      candidates AS (
        SELECT
          l.menu_id,
          l.changed_at,
          coalesce(
            nullif(trim(l.before_json->>'imageUrl'), ''),
            nullif(trim(l.after_json->>'imageUrl'), ''),
            nullif(trim(cf.elem->>'before'), ''),
            nullif(trim(cf.elem->>'after'), '')
          ) AS hist_image
        FROM public.pos_menu_audit_logs l
        JOIN targets t ON t.id = l.menu_id
        LEFT JOIN LATERAL jsonb_array_elements(coalesce(l.changed_fields_json, '[]'::jsonb)) cf(elem)
          ON cf.elem->>'field' IN ('imageUrl', 'image')
      ),
      best AS (
        SELECT DISTINCT ON (menu_id) menu_id, hist_image
        FROM candidates
        WHERE hist_image IS NOT NULL AND hist_image NOT IN ('null', '__NULL__')
        ORDER BY menu_id, changed_at DESC
      )
      UPDATE public.pos_menus pm
      SET image = best.hist_image
      FROM best
      WHERE pm.id = best.menu_id
        AND trim(coalesce(pm.image, '')) = ''
    $sql$;
  END IF;
END $$;

-- 2) Storage: 메뉴 id 기준 정규식 매칭 (가장 최근 파일명 = 타임스탬프 큰 값)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $sql$
      WITH base AS (
        SELECT regexp_replace(trim(image), '/[^/]+$', '') AS prefix
        FROM public.pos_menus
        WHERE image ILIKE '%.supabase.co/storage/v1/object/public/pos-menu-images%'
          AND trim(coalesce(image, '')) <> ''
        LIMIT 1
      ),
      targets AS (
        SELECT pm.id AS menu_id
        FROM public.pos_menus pm
        WHERE trim(coalesce(pm.image, '')) = ''
          AND lower(trim(pm.code)) IN ('c013', 'c020', 'c021', 'c022', 'c023')
      ),
      matched AS (
        SELECT DISTINCT ON (t.menu_id)
          t.menu_id,
          b.prefix || '/' || o.name AS hist_image
        FROM targets t
        CROSS JOIN base b
        JOIN storage.objects o
          ON o.bucket_id = 'pos-menu-images'
         AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = t.menu_id
        ORDER BY t.menu_id, o.name DESC
      )
      UPDATE public.pos_menus pm
      SET image = matched.hist_image
      FROM matched
      WHERE pm.id = matched.menu_id
        AND trim(coalesce(pm.image, '')) = ''
    $sql$;
  END IF;
END $$;

-- 3) 배달 override (있을 때)
DO $$
BEGIN
  IF to_regclass('public.pos_delivery_menu_images') IS NOT NULL THEN
    EXECUTE $sql$
      WITH targets AS (
        SELECT id FROM public.pos_menus
        WHERE trim(coalesce(image, '')) = ''
          AND lower(trim(code)) IN ('c013', 'c020', 'c021', 'c022', 'c023')
      ),
      best AS (
        SELECT DISTINCT ON (d.menu_id)
          d.menu_id,
          trim(d.image_url) AS hist_image
        FROM public.pos_delivery_menu_images d
        JOIN targets t ON t.id = d.menu_id
        WHERE trim(coalesce(d.image_url, '')) <> ''
        ORDER BY d.menu_id, d.updated_at DESC NULLS LAST
      )
      UPDATE public.pos_menus pm
      SET image = best.hist_image
      FROM best
      WHERE pm.id = best.menu_id
        AND trim(coalesce(pm.image, '')) = ''
    $sql$;
  END IF;
END $$;

-- 4) 확인 + Storage 에 id 는 있으나 아직 매칭 안 된 orphan (수동 매핑용)
SELECT
  pm.code,
  pm.id AS menu_id,
  CASE WHEN trim(coalesce(pm.image, '')) = '' THEN 'empty' ELSE 'ok' END AS status,
  left(trim(pm.image), 100) AS image_prefix
FROM public.pos_menus pm
WHERE lower(trim(pm.code)) IN ('c013', 'c020', 'c021', 'c022', 'c023')
ORDER BY pm.code;

-- orphan: pos-menu-images 버킷에서 숫자-id 패턴만 나열 (C013=28?, C020+=? 수동 확인)
-- SELECT name FROM storage.objects
-- WHERE bucket_id = 'pos-menu-images'
--   AND name ~ '^[0-9]+-[0-9]+(\.|_)'
-- ORDER BY name DESC
-- LIMIT 200;
