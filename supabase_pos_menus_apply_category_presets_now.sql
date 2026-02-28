-- ============================================================
-- pos_menus 대분류·소분류 일괄 적용 (원클릭)
-- 사용법: Supabase 대시보드 > SQL Editor에 붙여넣기 > Run
--
-- 1. category_main 컬럼 추가 (없으면)
-- 2. 기존 category → category_main + category 매핑
-- ============================================================

-- 1. 대분류 컬럼 추가
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS category_main TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_pos_menus_category_main ON pos_menus(category_main);

-- 2. Chicken (대분류): Triple Chicken, SNOW, ORIGINAL 등
UPDATE pos_menus SET category_main = 'Chicken', category = 'Triple Chicken'
  WHERE category IS NOT NULL AND TRIM(category) <> '' AND LOWER(TRIM(category)) = 'triple chicken';
UPDATE pos_menus SET category_main = 'Chicken', category = 'SNOW'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%snow%' OR LOWER(TRIM(category)) = 'snow series');
UPDATE pos_menus SET category_main = 'Chicken', category = 'ORIGINAL'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%original%series%' OR LOWER(TRIM(category)) = 'original series');
UPDATE pos_menus SET category_main = 'Chicken', category = 'Dosirak'
  WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'dosirak';
UPDATE pos_menus SET category_main = 'Chicken', category = 'Bar.B.Q'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%bar.b.q%' OR LOWER(TRIM(category)) LIKE '%barbq%' OR LOWER(TRIM(category)) LIKE '%bbq fried%');
UPDATE pos_menus SET category_main = 'Chicken', category = 'Banban'
  WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'banban';
UPDATE pos_menus SET category_main = 'Chicken', category = 'SPECIALTIES'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%specialties%' OR LOWER(TRIM(category)) = 'specialties series');

-- 3. Korean (대분류): Tteokbokki, KOREAN SOUP, KOREAN FOOD
UPDATE pos_menus SET category_main = 'Korean', category = 'Tteokbokki'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%tteokbokki%' OR LOWER(TRIM(category)) LIKE '%떡볶이%');
UPDATE pos_menus SET category_main = 'Korean', category = 'KOREAN SOUP'
  WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'korean soup';
UPDATE pos_menus SET category_main = 'Korean', category = 'KOREAN FOOD'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%korean food%');

-- 4. Side (대분류): SIDE MENU, SIDE DISH, salad
UPDATE pos_menus SET category_main = 'Side', category = 'SIDE MENU'
  WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'side menu';
UPDATE pos_menus SET category_main = 'Side', category = 'SIDE DISH'
  WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'side dish';
UPDATE pos_menus SET category_main = 'Side', category = 'salad'
  WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'salad';

-- 5. Drinks (대분류)
UPDATE pos_menus SET category_main = 'Drinks', category = 'DRINKS'
  WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE 'drinks%' OR LOWER(TRIM(category)) LIKE '%drinks%');
