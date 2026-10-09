-- ============================================================
-- pos_menus 대분류·소분류 프리셋 적용
-- 기존 category 값을 새 구조(category_main + category)로 매핑
--
-- 실행 순서:
-- 1. supabase_pos_menus_category_main.sql (category_main 컬럼 추가)
-- 2. 본 스크립트 (기존 데이터 매핑)
--
-- 대분류 4종: Chicken, Korean, Side, Drinks (영어 통일)
-- ============================================================

-- Chicken (대분류): Triple Chicken, SNOW, ORIGINAL, Dosirak, Bar.B.Q, Banban, SPECIALTIES
UPDATE pos_menus SET category_main = 'Chicken', category = 'Triple Chicken' WHERE category IS NOT NULL AND TRIM(category) <> '' AND LOWER(TRIM(category)) = 'triple chicken';
UPDATE pos_menus SET category_main = 'Chicken', category = 'SNOW' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%snow%series%' OR LOWER(TRIM(category)) = 'snow series');
UPDATE pos_menus SET category_main = 'Chicken', category = 'ORIGINAL' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%original%series%' OR LOWER(TRIM(category)) = 'original series');
UPDATE pos_menus SET category_main = 'Chicken', category = 'Dosirak' WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'dosirak';
UPDATE pos_menus SET category_main = 'Chicken', category = 'Bar.B.Q' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%bar.b.q%' OR LOWER(TRIM(category)) LIKE '%bar.b.q fried chicken%' OR LOWER(TRIM(category)) LIKE '%barbq%' OR LOWER(TRIM(category)) LIKE '%bbq fried%');
UPDATE pos_menus SET category_main = 'Chicken', category = 'Banban' WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'banban';
UPDATE pos_menus SET category_main = 'Chicken', category = 'SPECIALTIES' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%specialties%' OR LOWER(TRIM(category)) = 'specialties series');

-- Korean (대분류): Tteokbokki, KOREAN SOUP, KOREAN FOOD
UPDATE pos_menus SET category_main = 'Korean', category = 'Tteokbokki' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%tteokbokki%' OR LOWER(TRIM(category)) LIKE '%떡볶이%');
UPDATE pos_menus SET category_main = 'Korean', category = 'KOREAN SOUP' WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'korean soup';
UPDATE pos_menus SET category_main = 'Korean', category = 'KOREAN FOOD' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE '%korean food%' OR LOWER(TRIM(category)) LIKE '%korean food series%');

-- Side (대분류): SIDE MENU, SIDE DISH, salad
UPDATE pos_menus SET category_main = 'Side', category = 'SIDE MENU' WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'side menu';
UPDATE pos_menus SET category_main = 'Side', category = 'SIDE DISH' WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'side dish';
UPDATE pos_menus SET category_main = 'Side', category = 'salad' WHERE category IS NOT NULL AND LOWER(TRIM(category)) = 'salad';

-- Drinks (대분류): DRINKS
UPDATE pos_menus SET category_main = 'Drinks', category = 'DRINKS' WHERE category IS NOT NULL AND (LOWER(TRIM(category)) LIKE 'drinks%' OR LOWER(TRIM(category)) LIKE '%drinks%' OR LOWER(TRIM(category)) LIKE '%เครื่องดื่ม%');
