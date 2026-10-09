-- ============================================================
-- 소스(합성품) 테이블 - 원재료 → 소스 → 메뉴 원가
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 1. sauces: 소스 마스터 (code로 원가 계산기/메뉴 재료에서 참조)
CREATE TABLE IF NOT EXISTS sauces (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'g',
  total_quantity NUMERIC(12,4) DEFAULT 0,
  cost_per_unit NUMERIC(12,6) DEFAULT 0,
  overhead_percent NUMERIC(5,2) DEFAULT 5,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sauces IS '소스(합성품) - 원재료로 만든 소스. 원가 계산에서 items와 동일하게 사용';
COMMENT ON COLUMN sauces.code IS '고유 코드 (예: S001, 75). pos_menu_ingredients.item_code에서 참조';
COMMENT ON COLUMN sauces.cost_per_unit IS '단위당 원가 (캐시). 재료 가격 변경 시 재계산 필요';
COMMENT ON COLUMN sauces.overhead_percent IS 'OH(오버헤드) % - 기본 5';

-- 2. sauce_ingredients: 소스 레시피 (원재료 또는 다른 소스)
CREATE TABLE IF NOT EXISTS sauce_ingredients (
  id BIGSERIAL PRIMARY KEY,
  sauce_id BIGINT NOT NULL REFERENCES sauces(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  loss_rate NUMERIC(5,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sauce_ingredients_sauce ON sauce_ingredients(sauce_id);

COMMENT ON TABLE sauce_ingredients IS '소스 레시피 - item_code는 items.code 또는 sauces.code';
COMMENT ON COLUMN sauce_ingredients.item_code IS 'items 또는 sauces의 code';

-- 3. cost_settings: 전역 OH 등 (선택)
CREATE TABLE IF NOT EXISTS cost_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO cost_settings (key, value_json) VALUES
  ('default_overhead_percent', '5'::jsonb),
  ('global_overhead_percent', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;
