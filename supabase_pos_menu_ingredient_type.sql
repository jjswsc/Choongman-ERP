-- ============================================================
-- POS 메뉴 재료: food vs packaging 구분 (홀/배달 원가 분리)
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- ingredient_type: 'food' = 음식재료(홀+배달), 'packaging' = 포장재(배달만)
ALTER TABLE pos_menu_ingredients ADD COLUMN IF NOT EXISTS ingredient_type TEXT DEFAULT 'food';
-- 'food' = 기본, 'packaging' = 배달 시에만 원가에 포함
