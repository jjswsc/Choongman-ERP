-- PP30 신고 증빙 상태(세금계산서/영수증) 필드
ALTER TABLE public.vat_ledger_entries
  ADD COLUMN IF NOT EXISTS invoice_evidence_status TEXT NOT NULL DEFAULT 'required_pending',
  ADD COLUMN IF NOT EXISTS invoice_evidence_reason_code TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vat_ledger_entries_invoice_evidence_status_check'
  ) THEN
    ALTER TABLE public.vat_ledger_entries
      ADD CONSTRAINT vat_ledger_entries_invoice_evidence_status_check
      CHECK (invoice_evidence_status IN ('required_pending', 'received', 'not_required', 'unobtainable'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_vat_ledger_invoice_evidence_status
  ON public.vat_ledger_entries(invoice_evidence_status, tax_month);

COMMENT ON COLUMN public.vat_ledger_entries.invoice_evidence_status IS
  '증빙 상태: required_pending|received|not_required|unobtainable';
COMMENT ON COLUMN public.vat_ledger_entries.invoice_evidence_reason_code IS
  '증빙 상태 사유 코드(small_amount,supplier_refused,consumer_slip_only,lost_doc,other 등)';
