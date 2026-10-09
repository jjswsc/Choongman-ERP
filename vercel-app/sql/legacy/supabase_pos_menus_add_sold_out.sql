-- POS 메뉴 당일 품절 컬럼 추가
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS sold_out_date DATE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_menus_sold_out ON pos_menus(sold_out_date);
