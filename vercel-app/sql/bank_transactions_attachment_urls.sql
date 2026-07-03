-- 통장 출금 즉시 지급 시 인보이스·영수증 다중 첨부 (expense_accruals.attachment_urls 와 동일 형식)

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT NULL;

COMMENT ON COLUMN public.bank_transactions.attachment_urls IS
  'JSON string array of attachment data URLs (invoice/receipt, max per app)';

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NULL;

COMMENT ON COLUMN public.bank_transactions.vat_amount IS
  '부가세(VAT) — 경비·매입 출금 증빙용';
