-- pos_menu_options: 홀/배달/포장별 판매 여부
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행

ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_hall BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_delivery BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_packaging BOOLEAN DEFAULT true;
