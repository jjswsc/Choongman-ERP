-- 패티캐시 세금계산서(텍스 인보이스) · 매입 부가세(PP30) 연동
-- Supabase SQL Editor에서 1회 실행 (idempotent)

ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL,
  ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS vendor_code TEXT NULL;

COMMENT ON COLUMN public.petty_cash_transactions.invoice_received IS '세금계산서(텍스 인보이스) 수령 여부';
COMMENT ON COLUMN public.petty_cash_transactions.invoice_no IS '세금계산서/인보이스 번호';
COMMENT ON COLUMN public.petty_cash_transactions.invoice_photo_url IS '세금계산서 이미지(data URL 또는 URL)';
COMMENT ON COLUMN public.petty_cash_transactions.vat_amount IS '매입 부가세 금액(PP30 매입 원장 연동)';
COMMENT ON COLUMN public.petty_cash_transactions.vendor_code IS '거래처 코드(세금 ID 조회용, 선택)';
