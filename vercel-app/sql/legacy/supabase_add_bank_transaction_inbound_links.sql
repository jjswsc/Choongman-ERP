-- ============================================================
-- 통장 출금 ↔ 입고 배치 연동 (다건 + 금액 배분)
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_transaction_inbound_links (
  id BIGSERIAL PRIMARY KEY,
  bank_transaction_id BIGINT NOT NULL,
  inbound_batch_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank_transaction_id, inbound_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_bt_inbound_links_bank ON bank_transaction_inbound_links(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bt_inbound_links_inbound ON bank_transaction_inbound_links(inbound_batch_id);

COMMENT ON TABLE bank_transaction_inbound_links IS '통장 출금(물품 대금)과 입고 배치의 연동 및 금액 배분';
