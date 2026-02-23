-- ============================================================
-- 입고 중심 프로세스: inbound_batches + stock_logs 연동
-- ============================================================

-- 1. 입고 배치 테이블 (한 번 저장 = 한 배치)
CREATE TABLE IF NOT EXISTS inbound_batches (
  id BIGSERIAL PRIMARY KEY,
  location TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_code TEXT DEFAULT NULL,
  batch_date DATE NOT NULL,
  total_amount NUMERIC(12,2) DEFAULT 0,
  purchase_order_id BIGINT DEFAULT NULL,
  invoice_no TEXT DEFAULT NULL,
  invoice_photo_url TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_location ON inbound_batches(location);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_vendor ON inbound_batches(vendor_code);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_date ON inbound_batches(batch_date);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_po ON inbound_batches(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

-- 2. stock_logs에 inbound_batch_id 추가
ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS inbound_batch_id BIGINT DEFAULT NULL;
COMMENT ON COLUMN stock_logs.inbound_batch_id IS '입고 배치 ID (inbound_batches.id)';
CREATE INDEX IF NOT EXISTS idx_stock_logs_inbound_batch ON stock_logs(inbound_batch_id) WHERE inbound_batch_id IS NOT NULL;
