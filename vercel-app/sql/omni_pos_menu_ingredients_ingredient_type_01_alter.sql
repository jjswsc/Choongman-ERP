-- Omni: 원가 계산기 BOM 저장용 pos_menu_ingredients.ingredient_type
-- 증상: Could not find the 'ingredient_type' column of 'pos_menu_ingredients' in the schema cache
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요. (ADD COLUMN IF NOT EXISTS 이므로 재실행은 안전)

BEGIN;

ALTER TABLE public.pos_menu_ingredients
  ADD COLUMN IF NOT EXISTS ingredient_type text NOT NULL DEFAULT 'food';

UPDATE public.pos_menu_ingredients
SET ingredient_type = 'food'
WHERE ingredient_type IS NULL OR btrim(ingredient_type) = '';

COMMENT ON COLUMN public.pos_menu_ingredients.ingredient_type IS
  'food=식재료, packaging=포장재. 원가 계산기 Food/Packaging 구분.';

COMMIT;

NOTIFY pgrst, 'reload schema';
