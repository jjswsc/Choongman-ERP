-- ============================================================
-- pos_menus 대분류(category_main) 컬럼 추가
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행
-- ============================================================

-- 대분류 컬럼 추가 (카테고리 상위 레벨)
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS category_main TEXT DEFAULT '';
COMMENT ON COLUMN pos_menus.category_main IS '대분류 (예: 치킨, 사이드, 음료). category(소분류)의 상위 그룹';
CREATE INDEX IF NOT EXISTS idx_pos_menus_category_main ON pos_menus(category_main);
