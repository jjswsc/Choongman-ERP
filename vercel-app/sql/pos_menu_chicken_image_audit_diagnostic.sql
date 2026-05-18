-- 치킨 이미지 복구 전: DB·감사·Storage 에 남은 단서 확인 (Supabase SQL Editor)

-- A) 현재 pos_menus.image
SELECT 'pos_menus' AS src, image_kind, count(*) AS cnt
FROM (
  SELECT
    CASE
      WHEN trim(coalesce(image, '')) = '' THEN 'empty'
      WHEN image ILIKE '%.supabase.co/storage/%pos-menu-images%' THEN 'supabase_storage'
      ELSE 'other'
    END AS image_kind
  FROM public.pos_menus
  WHERE lower(coalesce(code, '')) LIKE 'c%'
) s
GROUP BY image_kind
ORDER BY src, image_kind;

-- B) 감사 로그에 imageUrl 이 한 번이라도 남아 있는지 (치킨 코드)
SELECT
  pm.code,
  pm.name,
  count(*) FILTER (
    WHERE coalesce(
      nullif(trim(l.before_json->>'imageUrl'), ''),
      nullif(trim(l.after_json->>'imageUrl'), ''),
      nullif(trim(cf.elem->>'before'), ''),
      nullif(trim(cf.elem->>'after'), '')
    ) IS NOT NULL
  ) AS audit_rows_with_image,
  max(l.changed_at) FILTER (
    WHERE coalesce(
      nullif(trim(l.before_json->>'imageUrl'), ''),
      nullif(trim(l.after_json->>'imageUrl'), ''),
      nullif(trim(cf.elem->>'before'), ''),
      nullif(trim(cf.elem->>'after'), '')
    ) IS NOT NULL
  ) AS last_seen_at,
  left(
    max(
      coalesce(
        nullif(trim(l.before_json->>'imageUrl'), ''),
        nullif(trim(l.after_json->>'imageUrl'), ''),
        nullif(trim(cf.elem->>'before'), ''),
        nullif(trim(cf.elem->>'after'), '')
      )
    ) FILTER (
      WHERE coalesce(
        nullif(trim(l.before_json->>'imageUrl'), ''),
        nullif(trim(l.after_json->>'imageUrl'), ''),
        nullif(trim(cf.elem->>'before'), ''),
        nullif(trim(cf.elem->>'after'), '')
      ) IS NOT NULL
    ),
    90
  ) AS sample_url
FROM public.pos_menus pm
LEFT JOIN public.pos_menu_audit_logs l ON l.menu_id = pm.id
LEFT JOIN LATERAL jsonb_array_elements(coalesce(l.changed_fields_json, '[]'::jsonb)) cf(elem)
  ON cf.elem->>'field' IN ('imageUrl', 'image')
WHERE lower(coalesce(pm.code, '')) LIKE 'c%'
GROUP BY pm.id, pm.code, pm.name
ORDER BY pm.code;

-- C) items 마스터 동일 코드
SELECT pm.code, pm.name, left(trim(i.image), 90) AS items_image
FROM public.pos_menus pm
JOIN public.items i ON lower(trim(i.code)) = lower(trim(pm.code))
WHERE lower(coalesce(pm.code, '')) LIKE 'c%'
  AND trim(coalesce(i.image, '')) <> ''
ORDER BY pm.code;

-- D) 배달 앱 override 이미지 (있으면)
SELECT pm.code, d.app_code, left(trim(d.image_url), 90) AS delivery_image
FROM public.pos_menus pm
JOIN public.pos_delivery_menu_images d ON d.menu_id = pm.id
WHERE lower(coalesce(pm.code, '')) LIKE 'c%'
  AND trim(coalesce(d.image_url, '')) <> ''
ORDER BY pm.code, d.app_code
LIMIT 50;

-- E) Storage 버킷 pos-menu-images (메뉴 id·코드가 파일명에 들어간 경우)
SELECT pm.code, pm.id AS menu_id, o.name AS storage_object
FROM public.pos_menus pm
JOIN storage.objects o
  ON o.bucket_id = 'pos-menu-images'
 AND (
   o.name ILIKE '%-' || pm.id::text || '_%'
   OR o.name ILIKE '%-' || pm.id::text || '.%'
   OR lower(o.name) LIKE '%' || lower(trim(pm.code)) || '%'
 )
WHERE lower(coalesce(pm.code, '')) LIKE 'c%'
  AND trim(coalesce(pm.image, '')) = ''
ORDER BY pm.code, o.name DESC
LIMIT 80;
