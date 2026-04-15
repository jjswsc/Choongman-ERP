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
CREATE TABLE IF NOT EXISTS public.account_subjects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  p_and_l_section TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  IF to_regclass('public.payable_transactions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payable_transactions_expense_accrual_id_fkey'
    ) THEN
      ALTER TABLE public.payable_transactions
        ADD CONSTRAINT payable_transactions_expense_accrual_id_fkey
        FOREIGN KEY (expense_accrual_id)
        REFERENCES public.expense_accruals(id)
        ON DELETE SET NULL;
    END IF;
  ELSE
    RAISE NOTICE 'SKIP: public.payable_transactions not found.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.payable_transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payable_transactions_expense_accrual_id ON public.payable_transactions(expense_accrual_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payable_transactions_petty_cash_transaction_id ON public.payable_transactions(petty_cash_transaction_id)';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) 회계 컴플라이언스/세무 보조장부
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  year_month TEXT PRIMARY KEY,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ NULL,
  closed_by TEXT NULL,
  unlocked_at TIMESTAMPTZ NULL,
  unlocked_by TEXT NULL,
  unlock_reason TEXT NULL,
  unlock_approved_by TEXT NULL
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
  filing_status TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  submitted_by TEXT NULL,
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
  filing_status TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  submitted_by TEXT NULL,
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

DO $$
BEGIN
  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON public.bank_transactions(reconciled_at)';
  ELSE
    RAISE NOTICE 'SKIP: public.bank_transactions not found.';
  END IF;
END $$;

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
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly', 'half_year', 'annual')),
  period_key TEXT NOT NULL DEFAULT '',
  filing_type TEXT NOT NULL,
  store_scope TEXT NOT NULL DEFAULT '*',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  note TEXT NULL,
  owner TEXT NULL,
  updated_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_type, period_key, filing_type, store_scope)
);

CREATE INDEX IF NOT EXISTS idx_accounting_filing_workflow_status_ym
  ON public.accounting_filing_workflow_status(year_month);

CREATE TABLE IF NOT EXISTS public.income_expense_closing_runs (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,
  store_scope TEXT NOT NULL DEFAULT 'All',
  status TEXT NOT NULL DEFAULT 'draft',
  profit_loss_account_code TEXT NOT NULL DEFAULT '3120',
  revenue_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_count INT NOT NULL DEFAULT 0,
  payload JSONB NULL,
  journal_entry_id BIGINT NULL,
  memo TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_expense_closing_runs_scope
  ON public.income_expense_closing_runs (year_month, store_scope, created_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_compliance_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  user_role TEXT NOT NULL,
  actor TEXT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'error')),
  reason_code TEXT NULL,
  year_month TEXT NULL,
  period_type TEXT NULL,
  period_key TEXT NULL,
  store_scope TEXT NULL,
  filing_type TEXT NULL,
  target_type TEXT NULL,
  target_id TEXT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_compliance_audit_created
  ON public.accounting_compliance_audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_workflow_events (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'monthly',
  period_key TEXT NULL,
  store_scope TEXT NULL,
  filing_type TEXT NOT NULL,
  status TEXT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NULL,
  source_workflow_status_id BIGINT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_workflow_events_period
  ON public.accounting_workflow_events (year_month, period_type, period_key, store_scope, filing_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_workflow_events_event
  ON public.accounting_workflow_events (event_type, occurred_at DESC);

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

ALTER TABLE public.income_expense_closing_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for income_expense_closing_runs" ON public.income_expense_closing_runs;
CREATE POLICY "Allow all for income_expense_closing_runs" ON public.income_expense_closing_runs
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.accounting_compliance_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_compliance_audit_logs" ON public.accounting_compliance_audit_logs;
CREATE POLICY "Allow all accounting_compliance_audit_logs" ON public.accounting_compliance_audit_logs
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.accounting_workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_workflow_events" ON public.accounting_workflow_events;
CREATE POLICY "Allow all accounting_workflow_events" ON public.accounting_workflow_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_accounting_compliance_audit_trend(
  p_base_year_month TEXT,
  p_months INTEGER DEFAULT 3,
  p_store_scope TEXT DEFAULT 'All',
  p_period_type TEXT DEFAULT '',
  p_decision TEXT DEFAULT '',
  p_action_keyword TEXT DEFAULT ''
)
RETURNS TABLE (
  year_month TEXT,
  total BIGINT,
  allow_count BIGINT,
  deny_count BIGINT,
  error_count BIGINT,
  deny_rate NUMERIC,
  error_rate NUMERIC
)
LANGUAGE sql
AS $$
WITH base AS (
  SELECT CASE
    WHEN p_base_year_month ~ '^\d{4}-\d{2}$' THEN to_date(p_base_year_month || '-01', 'YYYY-MM-DD')
    ELSE date_trunc('month', now())::date
  END AS base_month
),
months AS (
  SELECT to_char((base.base_month - (gs.n || ' month')::interval)::date, 'YYYY-MM') AS ym
  FROM base
  CROSS JOIN generate_series(0, GREATEST(COALESCE(p_months, 3), 1) - 1) AS gs(n)
),
filtered AS (
  SELECT a.year_month, a.decision
  FROM public.accounting_compliance_audit_logs a
  JOIN months m ON m.ym = a.year_month
  WHERE
    (
      COALESCE(NULLIF(trim(p_store_scope), ''), 'All') = 'All'
      OR COALESCE(a.store_scope, '') IN ('', 'All', trim(p_store_scope))
    )
    AND (
      COALESCE(NULLIF(trim(p_period_type), ''), '') = ''
      OR a.period_type = trim(p_period_type)
    )
    AND (
      COALESCE(NULLIF(trim(p_decision), ''), '') = ''
      OR a.decision = trim(p_decision)
    )
    AND (
      COALESCE(NULLIF(trim(p_action_keyword), ''), '') = ''
      OR COALESCE(a.action_type, '') ILIKE '%' || trim(p_action_keyword) || '%'
      OR COALESCE(a.reason_code, '') ILIKE '%' || trim(p_action_keyword) || '%'
    )
),
agg AS (
  SELECT
    f.year_month,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE f.decision = 'allow')::BIGINT AS allow_count,
    COUNT(*) FILTER (WHERE f.decision = 'deny')::BIGINT AS deny_count,
    COUNT(*) FILTER (WHERE f.decision = 'error')::BIGINT AS error_count
  FROM filtered f
  GROUP BY f.year_month
)
SELECT
  m.ym AS year_month,
  COALESCE(a.total, 0)::BIGINT AS total,
  COALESCE(a.allow_count, 0)::BIGINT AS allow_count,
  COALESCE(a.deny_count, 0)::BIGINT AS deny_count,
  COALESCE(a.error_count, 0)::BIGINT AS error_count,
  CASE WHEN COALESCE(a.total, 0) > 0 THEN ROUND((a.deny_count::NUMERIC / a.total::NUMERIC) * 100, 1) ELSE 0 END AS deny_rate,
  CASE WHEN COALESCE(a.total, 0) > 0 THEN ROUND((a.error_count::NUMERIC / a.total::NUMERIC) * 100, 1) ELSE 0 END AS error_rate
FROM months m
LEFT JOIN agg a ON a.year_month = m.ym
ORDER BY m.ym DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_thai_tax_filing_summary_agg(
  p_tax_months TEXT[],
  p_store_name TEXT DEFAULT 'All'
)
RETURNS TABLE (
  vat_output_net NUMERIC,
  vat_output_vat NUMERIC,
  vat_input_net NUMERIC,
  vat_input_vat NUMERIC,
  vat_payable_vat NUMERIC,
  vat_missing_tax_id_count BIGINT,
  vat_missing_invoice_count BIGINT,
  vat_row_count BIGINT,
  wht_total_gross NUMERIC,
  wht_total_withheld NUMERIC,
  wht_missing_tax_id_count BIGINT,
  wht_missing_certificate_count BIGINT,
  wht_row_count BIGINT,
  wht_by_form JSONB
)
LANGUAGE sql
AS $$
WITH month_list AS (
  SELECT unnest(COALESCE(p_tax_months, ARRAY[]::TEXT[])) AS tax_month
),
vat_filtered AS (
  SELECT COALESCE(v.direction, '') AS direction, COALESCE(v.net_amount, 0)::NUMERIC AS net_amount, COALESCE(v.vat_amount, 0)::NUMERIC AS vat_amount,
         COALESCE(v.counterparty_tax_id, '') AS counterparty_tax_id, COALESCE(v.invoice_number, '') AS invoice_number
  FROM public.vat_ledger_entries v
  JOIN month_list m ON m.tax_month = v.tax_month
  WHERE COALESCE(NULLIF(trim(p_store_name), ''), 'All') IN ('All', '*') OR v.store_name = trim(p_store_name)
),
vat_agg AS (
  SELECT COALESCE(SUM(CASE WHEN lower(direction) = 'output' THEN net_amount ELSE 0 END), 0) AS output_net,
         COALESCE(SUM(CASE WHEN lower(direction) = 'output' THEN vat_amount ELSE 0 END), 0) AS output_vat,
         COALESCE(SUM(CASE WHEN lower(direction) <> 'output' THEN net_amount ELSE 0 END), 0) AS input_net,
         COALESCE(SUM(CASE WHEN lower(direction) <> 'output' THEN vat_amount ELSE 0 END), 0) AS input_vat,
         COUNT(*) FILTER (WHERE trim(counterparty_tax_id) = '')::BIGINT AS missing_tax_id_count,
         COUNT(*) FILTER (WHERE trim(invoice_number) = '')::BIGINT AS missing_invoice_count,
         COUNT(*)::BIGINT AS row_count
  FROM vat_filtered
),
wht_filtered AS (
  SELECT upper(COALESCE(NULLIF(trim(w.form_hint), ''), 'PND53')) AS form_hint, COALESCE(w.gross_amount, 0)::NUMERIC AS gross_amount,
         COALESCE(w.wht_amount, 0)::NUMERIC AS wht_amount, COALESCE(w.payee_tax_id, '') AS payee_tax_id, COALESCE(w.certificate_no, '') AS certificate_no
  FROM public.withholding_tax_ledger_entries w
  JOIN month_list m ON m.tax_month = w.tax_month
  WHERE COALESCE(NULLIF(trim(p_store_name), ''), 'All') IN ('All', '*') OR w.store_name = trim(p_store_name)
),
wht_form_agg AS (
  SELECT form_hint, COALESCE(SUM(gross_amount), 0) AS gross, COALESCE(SUM(wht_amount), 0) AS withheld, COUNT(*)::BIGINT AS rows
  FROM wht_filtered GROUP BY form_hint
),
wht_total_agg AS (
  SELECT COALESCE(SUM(gross_amount), 0) AS total_gross, COALESCE(SUM(wht_amount), 0) AS total_withheld,
         COUNT(*) FILTER (WHERE trim(payee_tax_id) = '')::BIGINT AS missing_tax_id_count,
         COUNT(*) FILTER (WHERE trim(certificate_no) = '')::BIGINT AS missing_certificate_count,
         COUNT(*)::BIGINT AS row_count
  FROM wht_filtered
),
wht_json AS (
  SELECT COALESCE(jsonb_object_agg(form_hint, jsonb_build_object('gross', gross, 'withheld', withheld, 'rows', rows)), '{}'::jsonb) AS by_form
  FROM wht_form_agg
)
SELECT
  va.output_net AS vat_output_net, va.output_vat AS vat_output_vat, va.input_net AS vat_input_net, va.input_vat AS vat_input_vat,
  (va.output_vat - va.input_vat) AS vat_payable_vat, va.missing_tax_id_count AS vat_missing_tax_id_count,
  va.missing_invoice_count AS vat_missing_invoice_count, va.row_count AS vat_row_count,
  wt.total_gross AS wht_total_gross, wt.total_withheld AS wht_total_withheld, wt.missing_tax_id_count AS wht_missing_tax_id_count,
  wt.missing_certificate_count AS wht_missing_certificate_count, wt.row_count AS wht_row_count, wj.by_form AS wht_by_form
FROM vat_agg va
CROSS JOIN wht_total_agg wt
CROSS JOIN wht_json wj;
$$;

CREATE OR REPLACE FUNCTION public.get_kt20k_monthly_agg(p_year INTEGER, p_store TEXT DEFAULT 'All')
RETURNS TABLE (month TEXT, employee_count BIGINT, salary_amount NUMERIC, daily_wage_amount NUMERIC, other_comp_amount NUMERIC, total_wage NUMERIC, excess_over_20000 NUMERIC, net_wage_to_report NUMERIC, pnd1a_ledger_gross NUMERIC, diff_total_vs_pnd1a NUMERIC, diff_net_vs_pnd1a NUMERIC)
LANGUAGE sql
AS $$
WITH months AS (SELECT to_char(make_date(p_year, gs.m, 1), 'YYYY-MM') AS month FROM generate_series(1, 12) AS gs(m)),
paid_rows AS (
  SELECT left(COALESCE(p.month, ''), 7) AS month, COALESCE(p.store, '') AS store, COALESCE(p.name, '') AS name, COALESCE(p.employee_id, 0) AS employee_id,
         COALESCE(p.salary, 0)::NUMERIC AS salary, (COALESCE(p.pos_allow, 0)+COALESCE(p.haz_allow, 0)+COALESCE(p.diligence_allow, 0)+COALESCE(p.birth_bonus, 0)+COALESCE(p.spl_bonus, 0)+COALESCE(p.ot_amt, 0)+COALESCE(p.holiday_pay, 0))::NUMERIC AS other_comp
  FROM public.payroll_records p
  WHERE left(COALESCE(p.month, ''), 4)::INT = p_year AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(p.store, '') = trim(p_store))
    AND (lower(COALESCE(p.status, '')) IN ('paid', 'done', 'completed') OR lower(COALESCE(p.status, '')) LIKE '%paid%' OR COALESCE(p.status, '') LIKE '%ชำระ%')
),
emp_month_totals AS (
  SELECT r.month, CASE WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '') END AS emp_key, SUM(r.salary + r.other_comp)::NUMERIC AS emp_total
  FROM paid_rows r
  GROUP BY r.month, CASE WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '') END
),
monthly_payroll_agg AS (
  SELECT r.month, COUNT(DISTINCT CASE WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '') END)::BIGINT AS employee_count,
         SUM(r.salary)::NUMERIC AS salary_amount, 0::NUMERIC AS daily_wage_amount, SUM(r.other_comp)::NUMERIC AS other_comp_amount, SUM(r.salary + r.other_comp)::NUMERIC AS total_wage
  FROM paid_rows r GROUP BY r.month
),
monthly_excess AS (SELECT month, SUM(GREATEST(emp_total - 20000, 0))::NUMERIC AS excess_over_20000 FROM emp_month_totals GROUP BY month),
pnd1a_rows AS (
  SELECT left(COALESCE(w.tax_month, ''), 7) AS month, COALESCE(w.gross_amount, 0)::NUMERIC AS gross_amount
  FROM public.withholding_tax_ledger_entries w
  WHERE left(COALESCE(w.tax_month, ''), 4)::INT = p_year AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(w.store_name, '') = trim(p_store))
    AND (lower(replace(COALESCE(w.form_hint, ''), ' ', '')) LIKE '%pnd1a%' OR lower(COALESCE(w.form_hint, '')) LIKE '%1ก%' OR COALESCE(w.form_hint, '') LIKE '%ภ.ง.ด.1ก%')
),
pnd1a_monthly AS (SELECT month, SUM(gross_amount)::NUMERIC AS pnd1a_ledger_gross FROM pnd1a_rows GROUP BY month)
SELECT m.month, COALESCE(mp.employee_count, 0)::BIGINT AS employee_count, ROUND(COALESCE(mp.salary_amount, 0), 2) AS salary_amount, ROUND(COALESCE(mp.daily_wage_amount, 0), 2) AS daily_wage_amount,
       ROUND(COALESCE(mp.other_comp_amount, 0), 2) AS other_comp_amount, ROUND(COALESCE(mp.total_wage, 0), 2) AS total_wage, ROUND(COALESCE(me.excess_over_20000, 0), 2) AS excess_over_20000,
       ROUND(COALESCE(mp.total_wage, 0) - COALESCE(me.excess_over_20000, 0), 2) AS net_wage_to_report, ROUND(COALESCE(pm.pnd1a_ledger_gross, 0), 2) AS pnd1a_ledger_gross,
       ROUND(COALESCE(mp.total_wage, 0) - COALESCE(pm.pnd1a_ledger_gross, 0), 2) AS diff_total_vs_pnd1a, ROUND((COALESCE(mp.total_wage, 0) - COALESCE(me.excess_over_20000, 0)) - COALESCE(pm.pnd1a_ledger_gross, 0), 2) AS diff_net_vs_pnd1a
FROM months m LEFT JOIN monthly_payroll_agg mp ON mp.month = m.month LEFT JOIN monthly_excess me ON me.month = m.month LEFT JOIN pnd1a_monthly pm ON pm.month = m.month
ORDER BY m.month ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_kt20k_employee_diff_top(p_year INTEGER, p_store TEXT DEFAULT 'All', p_limit INTEGER DEFAULT 50)
RETURNS TABLE (employee_key TEXT, name TEXT, store TEXT, kt20k_total_wage NUMERIC, pnd1a_ledger_gross NUMERIC, diff NUMERIC, reason_tags JSONB)
LANGUAGE sql
AS $$
WITH kt20k_emp AS (
  SELECT COALESCE(p.store, '') AS store, COALESCE(p.name, '') AS name, SUM(COALESCE(p.salary, 0)+COALESCE(p.pos_allow, 0)+COALESCE(p.haz_allow, 0)+COALESCE(p.diligence_allow, 0)+COALESCE(p.birth_bonus, 0)+COALESCE(p.spl_bonus, 0)+COALESCE(p.ot_amt, 0)+COALESCE(p.holiday_pay, 0))::NUMERIC AS total_wage
  FROM public.payroll_records p
  WHERE left(COALESCE(p.month, ''), 4)::INT = p_year AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(p.store, '') = trim(p_store))
    AND (lower(COALESCE(p.status, '')) IN ('paid', 'done', 'completed') OR lower(COALESCE(p.status, '')) LIKE '%paid%' OR COALESCE(p.status, '') LIKE '%ชำระ%')
  GROUP BY COALESCE(p.store, ''), COALESCE(p.name, '')
),
pnd1a_emp AS (
  SELECT COALESCE(w.store_name, '') AS store, COALESCE(w.payee_name, '') AS name, SUM(COALESCE(w.gross_amount, 0))::NUMERIC AS total_gross
  FROM public.withholding_tax_ledger_entries w
  WHERE left(COALESCE(w.tax_month, ''), 4)::INT = p_year AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(w.store_name, '') = trim(p_store))
    AND (lower(replace(COALESCE(w.form_hint, ''), ' ', '')) LIKE '%pnd1a%' OR lower(COALESCE(w.form_hint, '')) LIKE '%1ก%' OR COALESCE(w.form_hint, '') LIKE '%ภ.ง.ด.1ก%')
  GROUP BY COALESCE(w.store_name, ''), COALESCE(w.payee_name, '')
),
joined AS (SELECT COALESCE(k.store, p.store) AS store, COALESCE(k.name, p.name) AS name, COALESCE(k.total_wage, 0)::NUMERIC AS kt20k_total_wage, COALESCE(p.total_gross, 0)::NUMERIC AS pnd1a_ledger_gross FROM kt20k_emp k FULL OUTER JOIN pnd1a_emp p ON p.store = k.store AND p.name = k.name),
tagged AS (
  SELECT (store || '|' || name) AS employee_key, name, store, ROUND(kt20k_total_wage, 2) AS kt20k_total_wage, ROUND(pnd1a_ledger_gross, 2) AS pnd1a_ledger_gross, ROUND(kt20k_total_wage - pnd1a_ledger_gross, 2) AS diff,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN kt20k_total_wage > 0 AND pnd1a_ledger_gross = 0 THEN 'missing_in_pnd1a' END,
           CASE WHEN kt20k_total_wage = 0 AND pnd1a_ledger_gross > 0 THEN 'missing_in_kt20k' END,
           CASE WHEN kt20k_total_wage > 0 AND pnd1a_ledger_gross > 0 AND ABS(kt20k_total_wage - pnd1a_ledger_gross) > 0.0001 THEN 'amount_mismatch' END
         ], NULL) AS tags
  FROM joined
)
SELECT employee_key, name, store, kt20k_total_wage, pnd1a_ledger_gross, diff, COALESCE(to_jsonb(tags), '[]'::JSONB) AS reason_tags
FROM tagged
WHERE ABS(diff) > 0.0001
ORDER BY ABS(diff) DESC
LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

COMMIT;
