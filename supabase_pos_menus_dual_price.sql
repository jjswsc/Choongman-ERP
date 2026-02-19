-- ============================================================
-- POS 메뉴 홀/배달앱 이중 가격
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- pos_menus: 배달앱 가격 추가 (기존 price = 홀 가격)
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS price_delivery NUMERIC(12,2);

-- pos_menu_options: 배달앱 옵션 추가금
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS price_modifier_delivery NUMERIC(12,2);

-- COMMENT (선택)
COMMENT ON COLUMN pos_menus.price IS '홀/매장/포장 판매가';
COMMENT ON COLUMN pos_menus.price_delivery IS '배달앱 판매가 (null이면 price 사용)';
COMMENT ON COLUMN pos_menu_options.price_modifier IS '홀 옵션 추가금';
COMMENT ON COLUMN pos_menu_options.price_modifier_delivery IS '배달앱 옵션 추가금 (null이면 price_modifier 사용)';
