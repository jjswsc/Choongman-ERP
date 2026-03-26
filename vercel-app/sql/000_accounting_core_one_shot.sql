-- ============================================================
-- CM_ERP Accounting & Thai Filing Core (One-shot)
-- Supabase SQL Editor에서 통째로 실행 (idempotent)
-- 범위: 자동분개·결산·세무보조·신고 패키지 준비
-- 기간 키: YYYY-MM (방콕시간 기준 운영과 맞춤)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) account_subjects 확장 (복식부기/COA 메타)
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.account_subjects
  ADD COLUMN IF NOT EXISTS statement_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS normal_side TEXT NULL,
  ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL REFERENCES public.account_subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name_th TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_header BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coa_class TEXT NULL;

COMMENT ON COLUMN public.account_subjects.statement_type IS 'bs | pl';
COMMENT ON COLUMN public.account_subjects.normal_side IS 'debit | credit';
COMMENT ON COLUMN public.account_subjects.parent_id IS '상위 계정과목 id (트리)';
COMMENT ON COLUMN public.account_subjects.name_th IS '태국어 표시명';
COMMENT ON COLUMN public.account_subjects.is_header IS '집계용 헤더(직접 분개 비권장)';
COMMENT ON COLUMN public.account_subjects.is_system IS '시스템 기본 계정(삭제 불가)';
COMMENT ON COLUMN public.account_subjects.coa_class IS '태국 재무제표 참고 1~5';

CREATE INDEX IF NOT EXISTS idx_account_subjects_parent_id
  ON public.account_subjects(parent_id);

INSERT INTO public.account_subjects
(code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side)
VALUES
  ('1010', '현금및예금', 'Cash and Banks', 'asset', NULL, 1, 'bs', 'debit'),
  ('1130', '매출채권', 'Trade Receivables', 'asset', NULL, 3, 'bs', 'debit'),
  ('1150', '대여금', 'Loans Receivable', 'asset', NULL, 4, 'bs', 'debit'),
  ('1160', '선급금', 'Prepayments', 'asset', NULL, 5, 'bs', 'debit'),
  ('1460', '재고자산', 'Inventory', 'asset', NULL, 2, 'bs', 'debit'),
  ('1470', '감가상각누계액', 'Accumulated Depreciation', 'asset', NULL, 2, 'bs', 'credit'),
  ('1490', '기타유형자산', 'Other Fixed Assets', 'asset', NULL, 8, 'bs', 'debit'),
  ('2110', '매입채무', 'Trade Payables', 'liability', NULL, 4, 'bs', 'credit'),
  ('2150', '차입금', 'Borrowings', 'liability', NULL, 5, 'bs', 'credit'),
  ('2170', '법인세예수금', 'Corporate Tax Payable', 'liability', NULL, 6, 'bs', 'credit'),
  ('2180', '부가세예수금', 'VAT Payable', 'liability', NULL, 6, 'bs', 'credit'),
  ('2190', '원천세예수금', 'Withholding Tax Payable', 'liability', NULL, 7, 'bs', 'credit'),
  ('3110', '자본금', 'Capital', 'equity', NULL, 5, 'bs', 'credit'),
  ('3120', '이익잉여금', 'Retained Earnings', 'equity', NULL, 6, 'bs', 'credit'),
  ('4110', '매출', 'Sales', 'revenue', 'revenue', 50, 'pl', 'credit'),
  ('5110', '매출원가', 'Cost of Goods Sold', 'expense', 'cost', 90, 'pl', 'debit'),
  ('5500', '감가상각비', 'Depreciation', 'expense', 'fixed', 132, 'pl', 'debit'),
  ('5520', '기타경비', 'Misc Expense', 'expense', 'expense', 199, 'pl', 'debit')
ON CONFLICT (code) DO NOTHING;

UPDATE public.account_subjects
SET statement_type = CASE
  WHEN type IN ('asset', 'liability', 'equity') THEN 'bs'
  ELSE 'pl'
END
WHERE statement_type IS NULL;

UPDATE public.account_subjects
SET normal_side = CASE
  WHEN type IN ('asset', 'expense') THEN 'debit'
  ELSE 'credit'
END
WHERE normal_side IS NULL;

UPDATE public.account_subjects
SET is_system = TRUE
WHERE code IN (
  '1010', '1130', '1150', '1160', '1460', '1470', '1490',
  '2110', '2150', '2170', '2180', '2190',
  '3110', '3120',
  '4110', '5110', '5500', '5520'
);

-- ------------------------------------------------------------
-- 1) 복식부기 핵심
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_no TEXT UNIQUE,
  accounting_date DATE NOT NULL,
  source_type TEXT NOT NULL,
  source_id BIGINT NULL,
  store_name TEXT NULL,
  memo TEXT NULL,
  posted_by TEXT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_accounting_date
  ON public.journal_entries(accounting_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source
  ON public.journal_entries(source_type, source_id);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_entry_id BIGINT NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  line_no INT NOT NULL DEFAULT 1,
  account_subject_id BIGINT NULL REFERENCES public.account_subjects(id),
  account_code TEXT NOT NULL,
  account_name TEXT NULL,
  side TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code
  ON public.journal_lines(account_code);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_subject_id
  ON public.journal_lines(account_subject_id);

CREATE TABLE IF NOT EXISTS public.ledger_balances (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT 'All',
  account_code TEXT NOT NULL,
  debit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year_month, store_name, account_code)
);

CREATE INDEX IF NOT EXISTS idx_ledger_balances_month_store
  ON public.ledger_balances(year_month, store_name);

-- ------------------------------------------------------------
-- 2) 고정자산/감가상각
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id BIGSERIAL PRIMARY KEY,
  asset_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT 'All',
  acquisition_date DATE NOT NULL,
  acquisition_cost NUMERIC(14,2) NOT NULL CHECK (acquisition_cost >= 0),
  residual_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (residual_rate >= 0 AND residual_rate <= 100),
  useful_life_months INT NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  status TEXT NOT NULL DEFAULT 'active',
  disposed_at DATE NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_store ON public.fixed_assets(store_name);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON public.fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_acquisition_date ON public.fixed_assets(acquisition_date);

CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id BIGSERIAL PRIMARY KEY,
  fixed_asset_id BIGINT NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  accounting_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  journal_entry_id BIGINT NULL REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fixed_asset_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_depreciation_entries_ym
  ON public.depreciation_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset
  ON public.depreciation_entries(fixed_asset_id);

-- ------------------------------------------------------------
-- 3) 지출관리/미지급 연계
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_accruals (
  id BIGSERIAL PRIMARY KEY,
  payee_code TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  due_date DATE NULL,
  memo TEXT NULL,
  account_subject_id BIGINT NULL,
  store_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_accruals_expense_date ON public.expense_accruals(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_accruals_due_date ON public.expense_accruals(due_date);
CREATE INDEX IF NOT EXISTS idx_expense_accruals_payee_code ON public.expense_accruals(payee_code);

ALTER TABLE public.expense_accruals
  ADD COLUMN IF NOT EXISTS approved_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS approved_role TEXT NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS approval_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejected_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejected_role TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_accruals_status ON public.expense_accruals(status);
CREATE INDEX IF NOT EXISTS idx_expense_accruals_approved_at ON public.expense_accruals(approved_at);

ALTER TABLE IF EXISTS public.payable_transactions
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS petty_cash_transaction_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS account_subject_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS expense_date DATE NULL,
  ADD COLUMN IF NOT EXISTS due_date DATE NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payable_transactions_expense_accrual_id_fkey'
  ) THEN
    ALTER TABLE public.payable_transactions
      ADD CONSTRAINT payable_transactions_expense_accrual_id_fkey
      FOREIGN KEY (expense_accrual_id)
      REFERENCES public.expense_accruals(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payable_transactions_expense_accrual_id
  ON public.payable_transactions(expense_accrual_id);
CREATE INDEX IF NOT EXISTS idx_payable_transactions_petty_cash_transaction_id
  ON public.payable_transactions(petty_cash_transaction_id);

-- ------------------------------------------------------------
-- 4) 회계 컴플라이언스/세무 보조장부
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  year_month TEXT PRIMARY KEY,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ NULL,
  closed_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_closed
  ON public.accounting_periods(is_closed);

CREATE TABLE IF NOT EXISTS public.accounting_filing_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  responsibilities JSONB NOT NULL DEFAULT '{}',
  notes TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.accounting_filing_preferences (id, responsibilities)
VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vat_ledger_entries (
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

CREATE INDEX IF NOT EXISTS idx_vat_ledger_tax_month ON public.vat_ledger_entries(tax_month);
CREATE INDEX IF NOT EXISTS idx_vat_ledger_doc_date ON public.vat_ledger_entries(doc_date);

CREATE TABLE IF NOT EXISTS public.withholding_tax_ledger_entries (
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

CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month
  ON public.withholding_tax_ledger_entries(tax_month);

ALTER TABLE IF EXISTS public.bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled
  ON public.bank_transactions(reconciled_at);

-- ------------------------------------------------------------
-- 5) 태국 신고 자동화 모델
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.thai_tax_code_mappings (
  id BIGSERIAL PRIMARY KEY,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('vat', 'wht', 'cit')),
  tax_code TEXT NOT NULL,
  filing_form TEXT NOT NULL,
  line_key TEXT NULL,
  description TEXT NULL,
  default_rate NUMERIC(8,4) NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thai_tax_code_mappings_active
  ON public.thai_tax_code_mappings(tax_type, filing_form, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_thai_tax_code_mappings_key
  ON public.thai_tax_code_mappings (tax_type, tax_code, filing_form, COALESCE(line_key, ''));

CREATE TABLE IF NOT EXISTS public.corporate_tax_adjustments (
  id BIGSERIAL PRIMARY KEY,
  period_key TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'half_year', 'annual')),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('add_back', 'deduction')),
  item_code TEXT NULL,
  item_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  memo TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_tax_adjustments_period
  ON public.corporate_tax_adjustments(period_type, period_key);

CREATE TABLE IF NOT EXISTS public.accounting_filing_workflow_status (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  note TEXT NULL,
  owner TEXT NULL,
  updated_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year_month, filing_type)
);

CREATE INDEX IF NOT EXISTS idx_accounting_filing_workflow_status_ym
  ON public.accounting_filing_workflow_status(year_month);

-- ------------------------------------------------------------
-- 6) RLS (서버에서 service_role 사용 시 우회 가능)
-- ------------------------------------------------------------
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for journal_entries" ON public.journal_entries;
CREATE POLICY "Allow all for journal_entries" ON public.journal_entries
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for journal_lines" ON public.journal_lines;
CREATE POLICY "Allow all for journal_lines" ON public.journal_lines
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.ledger_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for ledger_balances" ON public.ledger_balances;
CREATE POLICY "Allow all for ledger_balances" ON public.ledger_balances
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for fixed_assets" ON public.fixed_assets;
CREATE POLICY "Allow all for fixed_assets" ON public.fixed_assets
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for depreciation_entries" ON public.depreciation_entries;
CREATE POLICY "Allow all for depreciation_entries" ON public.depreciation_entries
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.expense_accruals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all expense_accruals" ON public.expense_accruals;
CREATE POLICY "Allow all expense_accruals" ON public.expense_accruals
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_periods" ON public.accounting_periods;
CREATE POLICY "Allow all accounting_periods" ON public.accounting_periods
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.accounting_filing_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_filing_preferences" ON public.accounting_filing_preferences;
CREATE POLICY "Allow all accounting_filing_preferences" ON public.accounting_filing_preferences
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.vat_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all vat_ledger_entries" ON public.vat_ledger_entries;
CREATE POLICY "Allow all vat_ledger_entries" ON public.vat_ledger_entries
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.withholding_tax_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all withholding_tax_ledger_entries" ON public.withholding_tax_ledger_entries;
CREATE POLICY "Allow all withholding_tax_ledger_entries" ON public.withholding_tax_ledger_entries
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.thai_tax_code_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all thai_tax_code_mappings" ON public.thai_tax_code_mappings;
CREATE POLICY "Allow all thai_tax_code_mappings" ON public.thai_tax_code_mappings
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.corporate_tax_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all corporate_tax_adjustments" ON public.corporate_tax_adjustments;
CREATE POLICY "Allow all corporate_tax_adjustments" ON public.corporate_tax_adjustments
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.accounting_filing_workflow_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_filing_workflow_status" ON public.accounting_filing_workflow_status;
CREATE POLICY "Allow all accounting_filing_workflow_status" ON public.accounting_filing_workflow_status
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
