-- ============================================================
-- POS 메뉴 관리 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- POS 메뉴 (판매 상품 - 품목/재료와 별도)
CREATE TABLE IF NOT EXISTS pos_menus (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  price NUMERIC(12,2) DEFAULT 0,
  image TEXT DEFAULT '',
  vat_included BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_menus_code ON pos_menus(code);
CREATE INDEX IF NOT EXISTS idx_pos_menus_category ON pos_menus(category);
CREATE INDEX IF NOT EXISTS idx_pos_menus_active ON pos_menus(is_active);

-- 메뉴 옵션 (반반, 뼈/순살, 사이즈 등)
CREATE TABLE IF NOT EXISTS pos_menu_options (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_modifier NUMERIC(12,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_menu_options_menu ON pos_menu_options(menu_id);

-- 메뉴 ↔ 재료 연결 (BOM)
CREATE TABLE IF NOT EXISTS pos_menu_ingredients (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  quantity NUMERIC(10,4) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_menu_ingredients_menu ON pos_menu_ingredients(menu_id);
CREATE INDEX IF NOT EXISTS idx_pos_menu_ingredients_item ON pos_menu_ingredients(item_code);
