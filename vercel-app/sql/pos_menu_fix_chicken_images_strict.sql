-- 치킨 메뉴 사진이 다른 메뉴 이미지로 붙은 경우: 전부 비운 뒤 Storage 파일명의 메뉴 id 와만 재매칭
-- 파일명 규칙: {업로드ms}-{pos_menus.id}._ / {id}_B  (예: 1774343948409-27._G, 1777969760600-76_B)
-- Asah 처럼 id 가 숫자가 아닌 파일명은 자동 매칭하지 않음 → 🍗 플레이스홀더

-- 1) 치킨 계열 image 전부 초기화
UPDATE public.pos_menus pm
SET image = ''
WHERE trim(coalesce(pm.image, '')) <> ''
  AND (
    lower(coalesce(pm.category_main, '')) IN ('chicken', '치킨')
    OR lower(trim(coalesce(pm.code, ''))) ~ '^c[0-9]+$'
  );

-- 2) Storage: 파일명에서 추출한 id = pos_menus.id 인 경우만 (가장 최근 파일명)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $sql$
      WITH base AS (
        SELECT coalesce(
          (
            SELECT regexp_replace(trim(image), '/[^/]+$', '')
            FROM public.pos_menus
            WHERE image ILIKE '%.supabase.co/storage/v1/object/public/pos-menu-images%'
              AND trim(coalesce(image, '')) <> ''
            LIMIT 1
          ),
          'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/pos-menu-images'
        ) AS prefix
      ),
      chicken AS (
        SELECT pm.id, pm.code, pm.name
        FROM public.pos_menus pm
        WHERE lower(coalesce(pm.category_main, '')) IN ('chicken', '치킨')
           OR lower(trim(coalesce(pm.code, ''))) ~ '^c[0-9]+$'
      ),
      storage_parsed AS (
        SELECT
          o.name,
          (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint AS file_menu_id
        FROM storage.objects o
        WHERE o.bucket_id = 'pos-menu-images'
          AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)')) IS NOT NULL
      ),
      matched AS (
        SELECT DISTINCT ON (c.id)
          c.id AS menu_id,
          b.prefix || '/' || sp.name AS hist_image
        FROM chicken c
        JOIN storage_parsed sp ON sp.file_menu_id = c.id
        CROSS JOIN base b
        ORDER BY c.id, sp.name DESC
      )
      UPDATE public.pos_menus pm
      SET image = matched.hist_image
      FROM matched
      WHERE pm.id = matched.menu_id
    $sql$;
  END IF;
END $$;

-- 3) 확인 (치킨 코드순)
SELECT
  pm.code,
  pm.name,
  pm.id AS menu_id,
  CASE
    WHEN trim(coalesce(pm.image, '')) = '' THEN 'empty'
    WHEN pm.image ILIKE '%.supabase.co/storage/%pos-menu-images%' THEN 'storage_by_id'
    ELSE 'other'
  END AS image_kind,
  left(trim(pm.image), 110) AS image_prefix,
  sp.name AS storage_object,
  (regexp_match(sp.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint AS file_menu_id
FROM public.pos_menus pm
LEFT JOIN LATERAL (
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'pos-menu-images'
    AND (regexp_match(o.name, '^[0-9]+-([0-9]+)(\.|_)'))[1]::bigint = pm.id
  ORDER BY o.name DESC
  LIMIT 1
) sp ON true
WHERE lower(coalesce(pm.category_main, '')) IN ('chicken', '치킨')
   OR lower(trim(coalesce(pm.code, ''))) ~ '^c[0-9]+$'
ORDER BY pm.code;
