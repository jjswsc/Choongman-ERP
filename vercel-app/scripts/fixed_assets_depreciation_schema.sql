-- ============================================================
-- 고정자산·감가상각 스키마
-- 사전 실행: accounting_double_entry_schema.sql (journal_entries 등)
-- ============================================================

-- 1) 고정자산 등록
CREATE TABLE IF NOT EXISTS fixed_assets (
  id BIGSERIAL PRIMARY KEY,
  asset_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT 'All',
  acquisition_date DATE NOT NULL,
  acquisition_cost NUMERIC(14,2) NOT NULL CHECK (acquisition_cost >= 0),
  residual_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (residual_rate >= 0 AND residual_rate <= 100),
  useful_life_months INT NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',  -- straight_line | declining_balance
  status TEXT NOT NULL DEFAULT 'active',  -- active | disposed
  disposed_at DATE NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_store ON fixed_assets(store_name);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_acquisition_date ON fixed_assets(acquisition_date);

COMMENT ON TABLE fixed_assets IS '고정자산 대장';
COMMENT ON COLUMN fixed_assets.residual_rate IS '잔존가치율(%) - 정액법 시 (취득가 × 잔존가치율)';
COMMENT ON COLUMN fixed_assets.useful_life_months IS '내용연수(개월)';

-- 2) 감가상각 실적 (월별 상각액 기록)
CREATE TABLE IF NOT EXISTS depreciation_entries (
  id BIGSERIAL PRIMARY KEY,
  fixed_asset_id BIGINT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,       -- YYYY-MM
  accounting_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  journal_entry_id BIGINT NULL,   -- 자동분개 시 journal_entries.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fixed_asset_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_depreciation_entries_ym ON depreciation_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset ON depreciation_entries(fixed_asset_id);

COMMENT ON TABLE depreciation_entries IS '감가상각 월별 실적';

-- 3) 계정과목: 감가상각누계액 (1470), 감가상각비(5500)는 기존 account_subjects에 있음
INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side)
VALUES ('1470', '감가상각누계액', 'Accumulated Depreciation', 'asset', NULL, 2, 'bs', 'credit')
ON CONFLICT (code) DO NOTHING;

-- RLS
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for fixed_assets" ON fixed_assets;
CREATE POLICY "Allow all for fixed_assets" ON fixed_assets FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE depreciation_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for depreciation_entries" ON depreciation_entries;
CREATE POLICY "Allow all for depreciation_entries" ON depreciation_entries FOR ALL USING (true) WITH CHECK (true);
