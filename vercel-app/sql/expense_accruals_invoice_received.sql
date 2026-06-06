-- 지출 발생(expense_accruals) 세금계산서(텍스 인보이스) 수령 여부
-- Supabase SQL Editor에서 1회 실행 (idempotent)

ALTER TABLE public.expense_accruals
  ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL,
  ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT NULL;

COMMENT ON COLUMN public.expense_accruals.invoice_received IS '세금계산서(텍스 인보이스) 수령 여부';
COMMENT ON COLUMN public.expense_accruals.invoice_no IS '세금계산서/인보이스 번호';
COMMENT ON COLUMN public.expense_accruals.invoice_photo_url IS '세금계산서 이미지(data URL 또는 URL)';
