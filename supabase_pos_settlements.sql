-- ============================================================
-- POS 결산 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- POS 일별 결산 (매장·날짜당 1건)
CREATE TABLE IF NOT EXISTS pos_settlements (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL DEFAULT '',
  settle_date DATE NOT NULL,
  cash_actual NUMERIC(12,2) DEFAULT NULL,
  card_amt NUMERIC(12,2) DEFAULT 0,
  qr_amt NUMERIC(12,2) DEFAULT 0,
  delivery_app_amt NUMERIC(12,2) DEFAULT 0,
  other_amt NUMERIC(12,2) DEFAULT 0,
  memo TEXT DEFAULT '',
  closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_code, settle_date)
);
CREATE INDEX IF NOT EXISTS idx_pos_settlements_store ON pos_settlements(store_code);
CREATE INDEX IF NOT EXISTS idx_pos_settlements_date ON pos_settlements(settle_date);

ALTER TABLE pos_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON pos_settlements;
CREATE POLICY "Allow all for anon" ON pos_settlements FOR ALL USING (true) WITH CHECK (true);
