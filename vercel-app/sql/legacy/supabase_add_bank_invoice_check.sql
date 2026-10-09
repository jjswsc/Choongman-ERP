-- ============================================================
-- 통장 거래 인보이스 수령 체크 (발주 없는 직접 구매 대응)
-- 통장 거래 조회에서 매입 대금 건에 인보이스 체크 가능
-- purchase_order_id로 발주서와 연동 시 양쪽 동기화
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE;
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS invoice_no TEXT DEFAULT NULL;
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT DEFAULT NULL;
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS purchase_order_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN bank_transactions.invoice_received IS '인보이스 수령 여부 (매입 대금 건)';
COMMENT ON COLUMN bank_transactions.invoice_no IS '인보이스 번호';
COMMENT ON COLUMN bank_transactions.invoice_photo_url IS '인보이스 사진 URL';
COMMENT ON COLUMN bank_transactions.purchase_order_id IS '연동된 발주서 ID (있으면 인보이스 체크 동기화)';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_po ON bank_transactions(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
