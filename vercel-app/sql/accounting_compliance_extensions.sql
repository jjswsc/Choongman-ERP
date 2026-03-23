-- 회계 마감·태국 신고 보조·부속장부·은행 대사
-- Supabase SQL Editor에서 실행 후 RLS 정책은 환경에 맞게 조정하세요.

-- 1) 회계 연월 마감
CREATE TABLE IF NOT EXISTS accounting_periods (
  year_month TEXT PRIMARY KEY,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ NULL,
  closed_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_closed ON accounting_periods(is_closed);

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_periods" ON accounting_periods;
CREATE POLICY "Allow all accounting_periods" ON accounting_periods FOR ALL USING (true) WITH CHECK (true);

-- 2) 신고 담당(자체/세무대리 등) — 단일 행
CREATE TABLE IF NOT EXISTS accounting_filing_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  responsibilities JSONB NOT NULL DEFAULT '{}',
  notes TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO accounting_filing_preferences (id, responsibilities)
VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE accounting_filing_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_filing_preferences" ON accounting_filing_preferences;
CREATE POLICY "Allow all accounting_filing_preferences" ON accounting_filing_preferences FOR ALL USING (true) WITH CHECK (true);

-- 3) 부가세 부속장부 (ภ.พ.30 보조)
CREATE TABLE IF NOT EXISTS vat_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  doc_date DATE NOT NULL,
  tax_month TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('output', 'input')),
  counterparty_name TEXT NULL,
  counterparty_tax_id TEXT NULL,
  invoice_number TEXT NULL,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_status TEXT NULL,
  memo TEXT NULL,
  store_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vat_ledger_tax_month ON vat_ledger_entries(tax_month);
CREATE INDEX IF NOT EXISTS idx_vat_ledger_doc_date ON vat_ledger_entries(doc_date);

ALTER TABLE vat_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all vat_ledger_entries" ON vat_ledger_entries;
CREATE POLICY "Allow all vat_ledger_entries" ON vat_ledger_entries FOR ALL USING (true) WITH CHECK (true);

-- 4) 원천징수 부속장부
CREATE TABLE IF NOT EXISTS withholding_tax_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  payment_date DATE NOT NULL,
  tax_month TEXT NOT NULL,
  payee_name TEXT NULL,
  payee_tax_id TEXT NULL,
  income_type TEXT NULL,
  gross_amount NUMERIC(14,2) NULL,
  wht_rate NUMERIC(6,2) NULL,
  wht_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  form_hint TEXT NULL,
  certificate_no TEXT NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month ON withholding_tax_ledger_entries(tax_month);

ALTER TABLE withholding_tax_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all withholding_tax_ledger_entries" ON withholding_tax_ledger_entries;
CREATE POLICY "Allow all withholding_tax_ledger_entries" ON withholding_tax_ledger_entries FOR ALL USING (true) WITH CHECK (true);

-- 5) 은행 거래 대사
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(reconciled_at);
