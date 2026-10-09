-- ============================================================
-- 미수금/미지급금 트랜잭션 테이블
-- 이벤트 기반: 매입/매출 발생·결제/수령 기록 → 잔액 집계
-- ============================================================

-- 매입채무 (payable): 매입처(vendor)에 대한 미지급금
CREATE TABLE IF NOT EXISTS payable_transactions (
  id BIGSERIAL PRIMARY KEY,
  vendor_code TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  ref_type TEXT NOT NULL DEFAULT 'PO',
  ref_id BIGINT DEFAULT NULL,
  trans_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payable_vendor ON payable_transactions(vendor_code);
CREATE INDEX IF NOT EXISTS idx_payable_ref ON payable_transactions(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_payable_date ON payable_transactions(trans_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_po_unique ON payable_transactions(ref_type, ref_id) WHERE ref_type = 'PO' AND ref_id IS NOT NULL;

-- 매출채권 (receivable): 매출처(store)에 대한 미수금
CREATE TABLE IF NOT EXISTS receivable_transactions (
  id BIGSERIAL PRIMARY KEY,
  store_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  ref_type TEXT NOT NULL DEFAULT 'Order',
  ref_id BIGINT DEFAULT NULL,
  trans_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receivable_store ON receivable_transactions(store_name);
CREATE INDEX IF NOT EXISTS idx_receivable_ref ON receivable_transactions(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_receivable_date ON receivable_transactions(trans_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_order_unique ON receivable_transactions(ref_type, ref_id) WHERE ref_type = 'Order' AND ref_id IS NOT NULL;
