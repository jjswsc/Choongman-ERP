-- ============================================================
-- pos_menu_options 테이블 필수 컬럼 추가
-- 옵션 구성(사이즈/부위, 홀·배달·포장 체크) 기능에 필요
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행
-- ============================================================

-- 기존 마이그레이션들 통합
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS price_modifier_delivery NUMERIC(12,2);
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS option_type TEXT DEFAULT 'substitution';
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,4) DEFAULT 1;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS option_step_values JSONB DEFAULT NULL;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_hall BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_delivery BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_packaging BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS price_modifier_packaging NUMERIC(12,2);
