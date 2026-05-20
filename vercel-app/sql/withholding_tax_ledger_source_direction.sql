-- 원천징수 부속장부: 방향(지급 시 공제 vs 수입 시 상대 공제) + 연동 출처
-- bank_transactions: 입금 시 상대방 원천징수액(통장 입금액은 보통 실수령=순액)

ALTER TABLE public.withholding_tax_ledger_entries
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound'));

ALTER TABLE public.withholding_tax_ledger_entries
  ADD COLUMN IF NOT EXISTS source_type TEXT NULL;

ALTER TABLE public.withholding_tax_ledger_entries
  ADD COLUMN IF NOT EXISTS source_id BIGINT NULL;

COMMENT ON COLUMN public.withholding_tax_ledger_entries.direction IS
  'outbound=당사가 지급 시 원천징수, inbound=당사 수입 시 상대가 원천징수';
COMMENT ON COLUMN public.withholding_tax_ledger_entries.source_type IS
  'purchase_order|expense_accrual|payroll_record|bank_transaction|manual';
COMMENT ON COLUMN public.withholding_tax_ledger_entries.source_id IS
  '연동 원본 PK (dedupe·추적)';

CREATE INDEX IF NOT EXISTS idx_wht_ledger_source
  ON public.withholding_tax_ledger_entries (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS withholding_tax_amount NUMERIC(14,2) NULL;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC(6,2) NULL;

COMMENT ON COLUMN public.bank_transactions.withholding_tax_amount IS
  '입금: 거래처가 원천징수한 금액(통장 amount는 실수령 순액 가정). 출금 시는 미사용.';
