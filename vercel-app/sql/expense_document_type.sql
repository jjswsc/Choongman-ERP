-- Expense Register 첨부 문서 유형 (Invoice / Tax Invoice / Receipt)
-- Tax Filing P.P.30 매입 VAT는 document_type = 'tax_invoice' 만 대상
-- Supabase SQL Editor에서 1회 실행 (idempotent)

ALTER TABLE public.expense_accruals
  ADD COLUMN IF NOT EXISTS document_type TEXT NULL;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS document_type TEXT NULL;

COMMENT ON COLUMN public.expense_accruals.document_type IS
  '첨부 문서 유형: invoice | tax_invoice | receipt. PP.30 매입 VAT는 tax_invoice만.';
COMMENT ON COLUMN public.bank_transactions.document_type IS
  '첨부 문서 유형: invoice | tax_invoice | receipt. PP.30 매입 VAT는 tax_invoice만.';

-- 기존 invoice_received=true → Tax Invoice로 간주
UPDATE public.expense_accruals
SET document_type = 'tax_invoice'
WHERE invoice_received IS TRUE
  AND (document_type IS NULL OR btrim(document_type) = '');

UPDATE public.bank_transactions
SET document_type = 'tax_invoice'
WHERE invoice_received IS TRUE
  AND (document_type IS NULL OR btrim(document_type) = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_accruals_document_type_check'
  ) THEN
    ALTER TABLE public.expense_accruals
      ADD CONSTRAINT expense_accruals_document_type_check
      CHECK (document_type IS NULL OR document_type IN ('invoice', 'tax_invoice', 'receipt'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_document_type_check'
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_document_type_check
      CHECK (document_type IS NULL OR document_type IN ('invoice', 'tax_invoice', 'receipt'));
  END IF;
END $$;
