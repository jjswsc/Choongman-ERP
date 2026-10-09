-- ============================================================
-- 통장 거래 ↔ 미수금/미지급금 연동
-- 매입 대금: 출금 + 거래처 선택 → payable 자동 생성
-- 매출 수령: 입금 + 매장 선택 → receivable 자동 생성
-- ============================================================

-- 1. bank_transactions에 거래처/매장 링크용 컬럼
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS vendor_code TEXT DEFAULT NULL;
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT NULL;
COMMENT ON COLUMN bank_transactions.vendor_code IS '매입 대금 지불 시 거래처 코드 (payable 연동)';
COMMENT ON COLUMN bank_transactions.store_name IS '매출 수령 시 매장명 (receivable 연동)';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_vendor ON bank_transactions(vendor_code) WHERE vendor_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_store ON bank_transactions(store_name) WHERE store_name IS NOT NULL;

-- 2. payable_transactions에 통장 거래 연동
ALTER TABLE payable_transactions
ADD COLUMN IF NOT EXISTS bank_transaction_id BIGINT DEFAULT NULL;
COMMENT ON COLUMN payable_transactions.bank_transaction_id IS '통장 출금과 연동 시 bank_transactions.id';
CREATE INDEX IF NOT EXISTS idx_payable_bank ON payable_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

-- 3. receivable_transactions에 통장 거래 연동
ALTER TABLE receivable_transactions
ADD COLUMN IF NOT EXISTS bank_transaction_id BIGINT DEFAULT NULL;
COMMENT ON COLUMN receivable_transactions.bank_transaction_id IS '통장 입금과 연동 시 bank_transactions.id';
CREATE INDEX IF NOT EXISTS idx_receivable_bank ON receivable_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
