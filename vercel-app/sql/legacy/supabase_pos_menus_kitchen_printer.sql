-- ============================================================
-- POS 메뉴 - 주방 프린터, 조리 시간
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================
-- kitchen_printer: 메뉴별 주문 시 출력할 주방 프린터 (1=주방1, 2=주방2, null=카테고리 기준)
-- cooking_time_min: 조리 시간(분), null 가능 (예상 완성 시간, KDS 등 활용)
-- ============================================================
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS kitchen_printer INT DEFAULT NULL;
COMMENT ON COLUMN pos_menus.kitchen_printer IS '주방 프린터: NULL=카테고리기준, 1=주방1, 2=주방2';

ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS cooking_time_min INT DEFAULT NULL;
COMMENT ON COLUMN pos_menus.cooking_time_min IS '조리 시간(분), 예상 완성 시간/KDS 등 활용';
