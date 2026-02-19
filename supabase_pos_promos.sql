-- ============================================================
-- POS 프로모션(세트) - 기존 메뉴 조합
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 프로모션 (치킨+음료+감자튀김 세트 등)
CREATE TABLE IF NOT EXISTS pos_promos (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '프로모션',
  price NUMERIC(12,2) DEFAULT 0,
  price_delivery NUMERIC(12,2),
  vat_included BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_promos_code ON pos_promos(code);
CREATE INDEX IF NOT EXISTS idx_pos_promos_active ON pos_promos(is_active);

-- 프로모션 구성 메뉴 (메뉴 + 옵션 선택)
CREATE TABLE IF NOT EXISTS pos_promo_items (
  id BIGSERIAL PRIMARY KEY,
  promo_id BIGINT NOT NULL REFERENCES pos_promos(id) ON DELETE CASCADE,
  menu_id BIGINT NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  option_id BIGINT REFERENCES pos_menu_options(id) ON DELETE SET NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_promo_items_promo ON pos_promo_items(promo_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_items_menu ON pos_promo_items(menu_id);
