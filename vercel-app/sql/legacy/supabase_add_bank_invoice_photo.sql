-- ============================================================
-- 통장 거래 인보이스 사진 URL (매입 대금 건 인보이스 이미지)
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT DEFAULT NULL;

COMMENT ON COLUMN bank_transactions.invoice_photo_url IS '인보이스 사진 URL (data URL 또는 외부 URL)';
