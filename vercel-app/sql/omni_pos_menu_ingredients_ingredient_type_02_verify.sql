-- Omni: ingredient_type 컬럼 확인 (01 실행 후)
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 기대: ingredient_type 1행, data_type=text

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pos_menu_ingredients'
  AND column_name = 'ingredient_type';
