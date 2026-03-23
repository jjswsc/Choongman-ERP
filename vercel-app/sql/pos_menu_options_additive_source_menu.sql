-- 추가형 POS 옵션: 품목코드(item_code) 대신 소스 메뉴(pos_menus) 기준으로 원가·재고 처리
-- Supabase SQL Editor 등에서 실행 후 배포

ALTER TABLE pos_menu_options
ADD COLUMN IF NOT EXISTS additive_source_menu_id integer REFERENCES pos_menus (id) ON DELETE SET NULL;

COMMENT ON COLUMN pos_menu_options.additive_source_menu_id IS '추가형 옵션: 이 메뉴의 기본 BOM(option_id NULL)을 quantity 배수만큼 가산';
