-- 품목–거래처 다대다 매핑 테이블
-- 실행: Supabase 대시보드 > SQL Editor > Run
CREATE TABLE IF NOT EXISTS item_vendors (
  id BIGSERIAL PRIMARY KEY,
  item_code TEXT NOT NULL,
  vendor_code TEXT NOT NULL,
  priority INT DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT NULL,
  min_order_qty NUMERIC(12,2) DEFAULT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_code, vendor_code)
);
CREATE INDEX IF NOT EXISTS idx_item_vendors_item_code ON item_vendors(item_code);
CREATE INDEX IF NOT EXISTS idx_item_vendors_vendor_code ON item_vendors(vendor_code);

ALTER TABLE item_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON item_vendors;
CREATE POLICY "Allow all for anon" ON item_vendors FOR ALL USING (true) WITH CHECK (true);
