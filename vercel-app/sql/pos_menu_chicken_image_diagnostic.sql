-- 치킨 메뉴 이미지 진단 (POS 🍗 플레이스홀더 원인 확인)
-- image 가 비어 있거나, Google Drive/로컬 URL만 있으면 POS에서 사진이 안 나올 수 있음.

SELECT
  id,
  code,
  name,
  category_main,
  CASE
    WHEN trim(coalesce(image, '')) = '' THEN 'empty'
    WHEN image ILIKE '%drive.google.com%' THEN 'google_drive'
    WHEN image ILIKE '%127.0.0.1%' OR image ILIKE '%localhost%' THEN 'loopback'
    WHEN image ILIKE '%.supabase.co/storage/%' THEN 'supabase_storage'
    ELSE 'other_url'
  END AS image_kind,
  left(trim(image), 120) AS image_prefix
FROM public.pos_menus
WHERE coalesce(is_active, true) = true
  AND (
    lower(coalesce(category_main, '')) IN ('chicken', '치킨')
    OR lower(coalesce(code, '')) LIKE 'c%'
  )
ORDER BY image_kind, code
LIMIT 80;
