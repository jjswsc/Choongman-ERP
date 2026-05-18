-- 치킨 메뉴 사진 전부 제거 (POS 에서 🍗 플레이스홀더)
-- Supabase SQL Editor 에서 이 파일만 실행

UPDATE public.pos_menus
SET image = ''
WHERE lower(coalesce(category_main, '')) IN ('chicken', '치킨')
   OR lower(trim(coalesce(code, ''))) ~ '^c[0-9]+$';

-- 확인
SELECT code, name, id AS menu_id,
  CASE WHEN trim(coalesce(image, '')) = '' THEN 'empty' ELSE 'still_has_image' END AS status,
  left(trim(image), 80) AS image_prefix
FROM public.pos_menus
WHERE lower(coalesce(category_main, '')) IN ('chicken', '치킨')
   OR lower(trim(coalesce(code, ''))) ~ '^c[0-9]+$'
ORDER BY code;
