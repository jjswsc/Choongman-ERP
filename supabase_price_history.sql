-- ============================================================
-- 가격 이력 테이블 - 메뉴/품목 가격 변경 추적
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_display_name TEXT,
  field_name TEXT NOT NULL,
  old_value NUMERIC(12,4),
  new_value NUMERIC(12,4),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT
);

COMMENT ON TABLE price_history IS '메뉴·품목 가격 변경 이력. entity_type: pos_menu, pos_menu_option, item';
COMMENT ON COLUMN price_history.entity_type IS 'pos_menu | pos_menu_option | item';
COMMENT ON COLUMN price_history.entity_id IS 'menu_id, option_id, 또는 item code';
COMMENT ON COLUMN price_history.entity_display_name IS '표시용 이름 (메뉴명, 품목명 등)';
COMMENT ON COLUMN price_history.field_name IS 'price, price_delivery, price_modifier, cost 등';
COMMENT ON COLUMN price_history.old_value IS '변경 전 값';
COMMENT ON COLUMN price_history.new_value IS '변경 후 값';

CREATE INDEX IF NOT EXISTS idx_price_history_entity ON price_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_price_history_changed ON price_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_display_name ON price_history(entity_display_name);

-- 카테고리/메뉴별 필터용 (기존 테이블에 추가 시)
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS category_main TEXT;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS parent_entity_id TEXT;
COMMENT ON COLUMN price_history.category IS '소분류(메뉴) 또는 카테고리(품목). 필터용';
COMMENT ON COLUMN price_history.category_main IS '대분류(메뉴). Chicken, Korean 등. 필터용';
COMMENT ON COLUMN price_history.parent_entity_id IS 'pos_menu_option일 때 menu_id. 메뉴별 필터용';
CREATE INDEX IF NOT EXISTS idx_price_history_category ON price_history(category);
CREATE INDEX IF NOT EXISTS idx_price_history_category_main ON price_history(category_main);
CREATE INDEX IF NOT EXISTS idx_price_history_parent ON price_history(parent_entity_id);
