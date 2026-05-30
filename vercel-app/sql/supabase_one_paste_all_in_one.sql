-- ============================================================
-- supabase_one_paste_all_in_one.sql  (auto-generated)
-- Supabase SQL Editor: paste entire file and Run (UTF-8)
--
-- Regenerate: vercel-app/scripts/build-supabase-one-paste-all-in-one.ps1
-- Guide: vercel-app/sql/SUPABASE_EDITOR_RUNBOOK.md
--
-- Includes: accounting, tax, POS, settlements, CRM, member portal, RPCs
-- Excludes: diagnostic SELECTs, K/T menu code recovery (run separately)
-- ============================================================

-- ============================================================
-- 1 accounting pos core
-- source: sql/supabase_one_paste_accounting_and_pos_printer_cut_clean.sql
-- ============================================================

-- ============================================================
-- supabase_one_paste_accounting_and_pos_printer_cut_clean.sql
-- Supabase SQL Editor에서 이 파일 전체를 한 번에 실행 (UTF-8)
--
-- 구성:
--   (1) 회계·복식부기·세무·급여(KT20k/PND1A RPC)
--   (2) pos_printer_settings + ESC/POS 절단 + 주방 옵션 출력 JSON
--   (3) pos_orders — 목록(getPosOrders)·저장(savePosOrder) 필수 컬럼
--   (4) pos_orders 멱등 idempotency_key_hash
--   (5) POS 다중 쿠폰(loyalty·redemptions·applied_coupons)
--   (6) 치킨 BBQ 메뉴 옵션 UI 정리 (C020~C023, 재실행 가능)
--   (7) pos_menu_options.option_code prefix 자동 보정
--
-- 실행 가이드(증상별·Editor 정리): sql/SUPABASE_EDITOR_RUNBOOK.md
--
-- 별도 파일(환경·ID 확인 후만):
--   sql/supabase_one_paste_optional_menu_code_recovery.sql — K001/T001 등 코드 복구
--
-- 의도적으로 제외:
--   - 진단용 SELECT (실행해도 스키마는 안 바뀜, Editor 결과만 쌓임)
--   - 동일 ALTER 중복 블록
--   - pos_purge / go-live 데이터 삭제
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
  asset_account_code TEXT NULL DEFAULT '1460',
  accumulated_depreciation_account_code TEXT NULL DEFAULT '1470',
  depreciation_expense_account_code TEXT NULL DEFAULT '5500',
  disposed_proceeds NUMERIC(14,2) NULL DEFAULT 0,
  disposal_gain_loss_amount NUMERIC(14,2) NULL,
  disposal_journal_entry_id BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  disposed_at DATE NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 DB에 fixed_assets가 이미 있으면 CREATE TABLE IF NOT EXISTS는 컬럼을 추가하지 않으므로 보강
ALTER TABLE IF EXISTS public.fixed_assets
  ADD COLUMN IF NOT EXISTS asset_account_code TEXT NULL DEFAULT '1460',
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_code TEXT NULL DEFAULT '1470',
  ADD COLUMN IF NOT EXISTS depreciation_expense_account_code TEXT NULL DEFAULT '5500',
  ADD COLUMN IF NOT EXISTS disposed_proceeds NUMERIC(14,2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_gain_loss_amount NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS disposal_journal_entry_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_store ON public.fixed_assets(store_name);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON public.fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_acquisition_date ON public.fixed_assets(acquisition_date);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_asset_account_code ON public.fixed_assets(asset_account_code);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_accum_dep_account_code ON public.fixed_assets(accumulated_depreciation_account_code);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_dep_exp_account_code ON public.fixed_assets(depreciation_expense_account_code);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_disposal_journal_entry_id ON public.fixed_assets(disposal_journal_entry_id);

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
  store_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.withholding_tax_ledger_entries
  ADD COLUMN IF NOT EXISTS store_name TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month
  ON public.withholding_tax_ledger_entries(tax_month);

CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month_store
  ON public.withholding_tax_ledger_entries (tax_month, store_name);

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

-- ------------------------------------------------------------
-- Payroll (KT20k·PND1A 대사 RPC)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  dept TEXT DEFAULT '',
  role TEXT DEFAULT '',
  salary NUMERIC(12,2) DEFAULT 0,
  pos_allow NUMERIC(12,2) DEFAULT 0,
  haz_allow NUMERIC(12,2) DEFAULT 0,
  birth_bonus NUMERIC(12,2) DEFAULT 0,
  holiday_pay NUMERIC(12,2) DEFAULT 0,
  spl_bonus NUMERIC(12,2) DEFAULT 0,
  ot_15 NUMERIC(12,2) DEFAULT 0,
  ot_20 NUMERIC(12,2) DEFAULT 0,
  ot_30 NUMERIC(12,2) DEFAULT 0,
  ot_amt NUMERIC(12,2) DEFAULT 0,
  late_min NUMERIC(12,2) DEFAULT 0,
  late_ded NUMERIC(12,2) DEFAULT 0,
  sso NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  other_ded NUMERIC(12,2) DEFAULT 0,
  net_pay NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT '확정',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (month, store, name)
);

CREATE INDEX IF NOT EXISTS idx_payroll_records_month ON public.payroll_records (month);

ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS employee_id BIGINT NULL;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS diligence_allow NUMERIC(12,2) DEFAULT 0;

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

-- ------------------------------------------------------------
-- POS: pos_printer_settings 부트스트랩 + ESC/POS 절단 컬럼
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_printer_settings (
  store_code text NOT NULL PRIMARY KEY,
  kitchen_mode integer DEFAULT 1,
  kitchen1_categories jsonb DEFAULT '[]'::jsonb,
  kitchen2_categories jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_kitchen_html boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_hall_order_html boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_payment_receipt_html boolean DEFAULT false;

COMMENT ON COLUMN public.pos_printer_settings.esc_pos_cut_after_kitchen_html IS
  'Windows 설치형 POS: 주방 주문서 인쇄 후 ESC/POS 절단';
COMMENT ON COLUMN public.pos_printer_settings.esc_pos_cut_after_hall_order_html IS
  'Windows 설치형 POS: 홀/터미널 주문서 인쇄 후 절단';
COMMENT ON COLUMN public.pos_printer_settings.esc_pos_cut_after_payment_receipt_html IS
  'Windows 설치형 POS: 결제 영수증 인쇄 후 절단';

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kitchen_slip_option_group_print JSONB NOT NULL DEFAULT
  '{"size": true, "part": true, "flavor": true, "side": true, "other": true}'::JSONB;

COMMENT ON COLUMN public.pos_printer_settings.kitchen_slip_option_group_print IS
  'Kitchen slip option group print flags: size/part/flavor/side/other';

-- ------------------------------------------------------------
-- (3) pos_orders — POS 터미널 주문 목록·저장 공통 컬럼
--     (컬럼 누락 시 getPosOrders 실패 → 홀/배달/포장 리스트 전부 비어 보임)
-- ------------------------------------------------------------
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS payment_cash_tendered NUMERIC(12,2) DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS applied_coupons JSONB;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS service_amt NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS service_reason TEXT;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS payment_other_breakdown JSONB;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS delivery_app_code TEXT;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS payment_delivery_app NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS delivery_payment_channel TEXT;

COMMENT ON COLUMN public.pos_orders.payment_cash_tendered IS
  'POS 현금: 손님이 건넨 금액(거스름 표시)';
COMMENT ON COLUMN public.pos_orders.applied_coupons IS
  '다중 쿠폰 적용 스냅샷(JSON)';
COMMENT ON COLUMN public.pos_orders.guest_count IS
  '홀(dine_in) 손님 수';

-- ------------------------------------------------------------
-- (4) pos_orders 멱등 저장 (savePosOrder X-Idempotency-Key)
-- ------------------------------------------------------------
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS idempotency_key_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_orders_idempotency_key_hash
  ON public.pos_orders(idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

-- ------------------------------------------------------------
-- (5) POS 다중 쿠폰 — pos_multi_coupon.sql
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_loyalty_settings (
  brand_key TEXT PRIMARY KEY DEFAULT 'default',
  max_coupons_per_order INTEGER NOT NULL DEFAULT 10,
  coupon_stack_with_manual_discount BOOLEAN NOT NULL DEFAULT TRUE,
  coupon_stack_with_points BOOLEAN NOT NULL DEFAULT TRUE,
  coupon_calc_base TEXT NOT NULL DEFAULT 'remaining',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.pos_loyalty_settings (brand_key)
VALUES ('default')
ON CONFLICT (brand_key) DO NOTHING;

ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS min_order_amt NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS max_per_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS redemption_mode TEXT NOT NULL DEFAULT 'reusable_code';
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS allow_quantity_entry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS stack_mode TEXT NOT NULL DEFAULT 'fixed_only';
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS max_discount_amt NUMERIC(14,2);
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.pos_coupons
SET max_per_order = GREATEST(max_per_order, 10),
    allow_quantity_entry = CASE
      WHEN redemption_mode = 'reusable_code' THEN TRUE
      ELSE allow_quantity_entry
    END
WHERE discount_type <> 'percent'
  AND max_per_order <= 1;

CREATE TABLE IF NOT EXISTS public.pos_order_coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  store_code TEXT NOT NULL,
  coupon_id BIGINT REFERENCES public.pos_coupons(id),
  coupon_code TEXT NOT NULL,
  discount_amt NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  serial_id BIGINT,
  member_coupon_issue_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_order_coupon_redemptions_order_id
  ON public.pos_order_coupon_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_coupon_redemptions_store_created
  ON public.pos_order_coupon_redemptions(store_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_order_coupon_redemptions_code
  ON public.pos_order_coupon_redemptions(coupon_code);

CREATE TABLE IF NOT EXISTS public.pos_coupon_serials (
  id BIGSERIAL PRIMARY KEY,
  coupon_id BIGINT NOT NULL REFERENCES public.pos_coupons(id) ON DELETE CASCADE,
  serial_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  order_id BIGINT REFERENCES public.pos_orders(id),
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (serial_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_coupon_serials_coupon_id
  ON public.pos_coupon_serials(coupon_id);
CREATE INDEX IF NOT EXISTS idx_pos_coupon_serials_status
  ON public.pos_coupon_serials(status);

ALTER TABLE public.pos_promo_items
  ADD COLUMN IF NOT EXISTS option_code TEXT;

COMMENT ON COLUMN public.pos_promo_items.option_code IS
  'POS option_code snapshot for promo composition (Grab/order mapping)';

-- ------------------------------------------------------------
-- (6) 치킨 BBQ 옵션 UI — pos_menu_fix_curry_garlic_barbq_option_ui.sql (SELECT 제외)
-- ------------------------------------------------------------
UPDATE public.pos_menus m
SET
  option_selection_groups = COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(trim(elem)))
      FROM jsonb_array_elements_text(COALESCE(m.option_selection_groups, '[]'::JSONB)) AS elem
      WHERE lower(trim(elem)) NOT IN ('size', 'part')
    ),
    '[]'::JSONB
  ),
  option_selection_config = COALESCE(
    (
      SELECT jsonb_agg(cfg)
      FROM jsonb_array_elements(COALESCE(m.option_selection_config, '[]'::JSONB)) AS cfg
      WHERE lower(trim(COALESCE(cfg->>'key', ''))) NOT IN ('size', 'part')
    ),
    '[]'::JSONB
  )
WHERE m.code IN ('C020', 'C021', 'C022', 'C023');

DO $$
BEGIN
  IF to_regclass('public.pos_menu_option_group_links') IS NOT NULL
     AND to_regclass('public.pos_option_groups') IS NOT NULL THEN
    DELETE FROM public.pos_menu_option_group_links l
    USING public.pos_menus m, public.pos_option_groups g
    WHERE l.menu_id = m.id
      AND l.group_id = g.id
      AND m.code IN ('C020', 'C021', 'C022', 'C023')
      AND lower(trim(COALESCE(g.group_key, ''))) IN ('size', 'part');
  END IF;
END $$;

DELETE FROM public.pos_menu_options o
USING public.pos_menus m
WHERE o.menu_id = m.id
  AND m.code IN ('C020', 'C021', 'C022', 'C023')
  AND COALESCE(o.option_type, 'substitution') = 'substitution'
  AND trim(COALESCE(o.name, '')) IN ('M - Wing', 'M - Drumette');

INSERT INTO public.pos_menu_options (
  menu_id, name, price_modifier, price_modifier_delivery, sort_order,
  option_type, option_step_values, sell_hall, sell_delivery, sell_packaging
)
SELECT
  m.id,
  v.name,
  90,
  100,
  v.sort_order,
  'substitution',
  '{}'::JSONB,
  TRUE,
  TRUE,
  TRUE
FROM public.pos_menus m
CROSS JOIN (VALUES ('M - Boneless', 0)) AS v(name, sort_order)
WHERE m.code IN ('C020', 'C021', 'C022', 'C023')
  AND NOT EXISTS (
    SELECT 1
    FROM public.pos_menu_options o
    WHERE o.menu_id = m.id
      AND COALESCE(o.option_type, 'substitution') = 'substitution'
      AND trim(COALESCE(o.name, '')) = v.name
  );

UPDATE public.pos_menu_options o
SET option_step_values = '{}'::JSONB
FROM public.pos_menus m
WHERE o.menu_id = m.id
  AND m.code IN ('C020', 'C021', 'C022', 'C023')
  AND COALESCE(o.option_type, 'substitution') = 'substitution'
  AND trim(COALESCE(o.name, '')) = 'M - Boneless'
  AND (
    o.option_step_values IS NULL
    OR o.option_step_values = 'null'::JSONB
    OR trim(COALESCE(o.option_step_values::TEXT, '')) IN ('', '{}')
    OR (o.option_step_values ? 'size')
    OR (o.option_step_values ? 'part')
  );

-- ------------------------------------------------------------
-- (7) option_code prefix 자동 보정 — UPDATE만 (진단 SELECT 제외)
-- ------------------------------------------------------------
WITH analyzed AS (
  SELECT
    o.id,
    o.menu_id,
    trim(COALESCE(m.code, '')) AS menu_code,
    trim(COALESCE(o.option_code, '')) AS option_code,
    regexp_match(trim(COALESCE(o.option_code, '')), '^(.*)-([0-9]+)$') AS code_match
  FROM public.pos_menu_options o
  JOIN public.pos_menus m ON m.id = o.menu_id
),
normalized AS (
  SELECT
    a.*,
    COALESCE((a.code_match)[1], '') AS code_prefix,
    CASE
      WHEN a.code_match IS NOT NULL THEN ((a.code_match)[2])::INT
      ELSE NULL
    END AS suffix_num,
    CASE
      WHEN a.code_match IS NOT NULL
       AND lower(COALESCE((a.code_match)[1], '')) = lower(a.menu_code) THEN TRUE
      ELSE FALSE
    END AS prefix_ok,
    row_number() OVER (
      PARTITION BY a.menu_id, lower(a.option_code)
      ORDER BY a.id
    ) AS dup_rn
  FROM analyzed a
),
menu_max_suffix AS (
  SELECT menu_id, max(suffix_num) AS max_suffix
  FROM normalized
  WHERE menu_code <> ''
    AND prefix_ok = TRUE
    AND suffix_num IS NOT NULL
  GROUP BY menu_id
),
targets AS (
  SELECT
    n.id,
    n.menu_id,
    n.menu_code,
    row_number() OVER (PARTITION BY n.menu_id ORDER BY n.id) AS seq
  FROM normalized n
  WHERE n.menu_code <> ''
    AND (
      n.option_code = ''
      OR n.prefix_ok = FALSE
      OR (n.option_code <> '' AND n.dup_rn > 1)
    )
),
new_codes AS (
  SELECT
    t.id,
    t.menu_id,
    t.menu_code || '-' || (COALESCE(ms.max_suffix, 0) + t.seq)::TEXT AS next_option_code
  FROM targets t
  LEFT JOIN menu_max_suffix ms ON ms.menu_id = t.menu_id
)
UPDATE public.pos_menu_options o
SET option_code = nc.next_option_code
FROM new_codes nc
WHERE o.id = nc.id;


-- ============================================================
-- 8 pos_settlements
-- source: sql/pos_settlements_bootstrap.sql
-- ============================================================

-- ============================================================
-- pos_settlements_bootstrap.sql
-- POS 일별 결산 테이블 + RLS + upsert 인덱스
-- Supabase SQL Editor에서 이 파일만 실행 (재실행 가능)
--
-- 컬럼 누락(PGRST204 cash_amt 등): pos_settlements_align_app_columns.sql 추가 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_settlements (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL DEFAULT '',
  settle_date DATE NOT NULL,
  cash_actual NUMERIC(12,2) DEFAULT NULL,
  cash_actual_denoms JSONB DEFAULT NULL,
  cash_amt NUMERIC(12,2) DEFAULT 0,
  card_amt NUMERIC(12,2) DEFAULT 0,
  card_breakdown JSONB DEFAULT '{}'::jsonb,
  qr_amt NUMERIC(12,2) DEFAULT 0,
  qr_breakdown JSONB DEFAULT '{}'::jsonb,
  delivery_app_amt NUMERIC(12,2) DEFAULT 0,
  delivery_app_breakdown JSONB DEFAULT '{}'::jsonb,
  dine_in_delivery_amt NUMERIC(12,2) DEFAULT 0,
  dine_in_delivery_breakdown JSONB DEFAULT '{}'::jsonb,
  other_amt NUMERIC(12,2) DEFAULT 0,
  other_breakdown JSONB DEFAULT '{}'::jsonb,
  memo TEXT DEFAULT '',
  closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_code, settle_date)
);

CREATE INDEX IF NOT EXISTS idx_pos_settlements_store ON public.pos_settlements(store_code);
CREATE INDEX IF NOT EXISTS idx_pos_settlements_date ON public.pos_settlements(settle_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_settlements_store_date
  ON public.pos_settlements (store_code, settle_date);

ALTER TABLE public.pos_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for pos_settlements" ON public.pos_settlements;
DROP POLICY IF EXISTS "Allow all for anon" ON public.pos_settlements;
CREATE POLICY "Allow all for pos_settlements"
  ON public.pos_settlements
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pos_orders_store_created_at
  ON public.pos_orders (store_code, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_orders_status_store_created_at
  ON public.pos_orders (status, store_code, created_at);


-- ============================================================
-- 9 pos_orders RLS
-- source: sql/pos_orders_rls_bootstrap.sql
-- ============================================================

-- ============================================================
-- pos_orders_rls_bootstrap.sql
-- RLS가 켜져 있는데 정책이 없어 POS 조회/저장이 막힐 때 실행
-- (증상: 주문·테이블·메뉴 목록이 빈 배열, INSERT/UPDATE 실패)
-- 재실행 가능
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_orders', 'pos_table_layouts', 'pos_menus', 'pos_menu_options',
    'pos_menu_ingredients', 'pos_promos', 'pos_promo_items'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow select pos_orders" ON public.pos_orders;
CREATE POLICY "Allow select pos_orders" ON public.pos_orders
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
CREATE POLICY "Allow insert pos_orders" ON public.pos_orders
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
CREATE POLICY "Allow update pos_orders" ON public.pos_orders
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select pos_table_layouts" ON public.pos_table_layouts;
CREATE POLICY "Allow select pos_table_layouts" ON public.pos_table_layouts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_menus" ON public.pos_menus;
CREATE POLICY "Allow select pos_menus" ON public.pos_menus
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_menu_options" ON public.pos_menu_options;
CREATE POLICY "Allow select pos_menu_options" ON public.pos_menu_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients;
CREATE POLICY "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_promos" ON public.pos_promos;
CREATE POLICY "Allow select pos_promos" ON public.pos_promos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_promo_items" ON public.pos_promo_items;
CREATE POLICY "Allow select pos_promo_items" ON public.pos_promo_items
  FOR SELECT USING (true);


-- ============================================================
-- 10 account_subjects 5528 5529
-- source: sql/account_subjects_delivery_card_fee.sql
-- ============================================================

-- 지출관리: 배달앱 수수료 / 카드 수수료 계정과목 (없을 때만 삽입)
-- Supabase SQL Editor에서 실행

INSERT INTO public.account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('5528', '배달앱수수료', 'Delivery Fee', 'expense', 'expense', 137),
  ('5529', '카드수수료', 'Card Fee', 'expense', 'expense', 138)
ON CONFLICT (code) DO NOTHING;

-- 기존 DB에 코드만 있고 영문명이 다를 때 표시명 정리 (선택)
UPDATE public.account_subjects
SET
  name = '배달앱수수료',
  name_en = 'Delivery Fee',
  type = 'expense',
  p_and_l_section = 'expense',
  sort_order = 137
WHERE code = '5528'
  AND (name_en IS DISTINCT FROM 'Delivery Fee' OR p_and_l_section IS DISTINCT FROM 'expense');

UPDATE public.account_subjects
SET
  name = '카드수수료',
  name_en = 'Card Fee',
  type = 'expense',
  p_and_l_section = 'expense',
  sort_order = 138
WHERE code = '5529'
  AND (name_en IS DISTINCT FROM 'Card Fee' OR p_and_l_section IS DISTINCT FROM 'expense');


-- ============================================================
-- 11 channel settlement
-- source: sql/pos_channel_settlement_deploy_one_paste.sql
-- ============================================================

-- 채널 정산·플랫폼 % 배포 (Supabase SQL Editor에 이 파일만 순서대로 실행)
-- 오류 "column o.card_fee_amt does not exist" → 아래 1)을 먼저 실행하지 않은 경우

-- 1) POS 주문 카드 수수료 스냅샷 컬럼
ALTER TABLE IF EXISTS public.pos_orders
  ADD COLUMN IF NOT EXISTS card_fee_amt NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_mode TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_rate NUMERIC(8, 4) DEFAULT 0;

-- 2) 배달앱 플랫폼 정산 % 컬럼
ALTER TABLE IF EXISTS public.pos_delivery_app_policies
  ADD COLUMN IF NOT EXISTS settlement_fee_pct NUMERIC(5, 2) NULL;

-- 3) 전 매장 Grab 20% / LINE MAN 18% / Shopee 13%
WITH store_list AS (
  SELECT DISTINCT trim(store_code) AS store_code
  FROM (
    SELECT store_code FROM public.erp_stores WHERE coalesce(is_active, true)
    UNION ALL
    SELECT store_code FROM public.pos_delivery_app_policies
    UNION ALL
    SELECT store_code FROM public.pos_orders WHERE trim(coalesce(store_code, '')) <> ''
    UNION ALL
    SELECT trim(store) AS store_code
    FROM public.employees
    WHERE trim(coalesce(store, '')) <> ''
  ) u
  WHERE trim(store_code) <> ''
    AND lower(trim(store_code)) NOT IN ('all', '전체')
),
app_rates (app_code, settlement_fee_pct) AS (
  VALUES
    ('grab', 20.00::numeric),
    ('lineman', 18.00::numeric),
    ('shopee', 13.00::numeric)
)
INSERT INTO public.pos_delivery_app_policies (
  store_code,
  app_code,
  enabled,
  order_acceptance_mode,
  settlement_fee_pct,
  updated_at
)
SELECT
  s.store_code,
  r.app_code,
  true,
  'manual',
  r.settlement_fee_pct,
  now()
FROM store_list s
CROSS JOIN app_rates r
ON CONFLICT (store_code, app_code)
DO UPDATE SET
  settlement_fee_pct = EXCLUDED.settlement_fee_pct,
  updated_at = now();

-- 4) 채널 정산 테이블
CREATE TABLE IF NOT EXISTS public.pos_channel_settlements (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL,
  settle_date DATE NOT NULL,
  channel TEXT NOT NULL,
  gross_amt NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (gross_amt >= 0),
  fee_amt NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (fee_amt >= 0),
  net_amt NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (net_amt >= 0),
  fee_source TEXT NULL,
  memo TEXT NULL,
  bank_transaction_id BIGINT NULL,
  journal_entry_id BIGINT NULL,
  posted_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_code, settle_date, channel)
);

CREATE INDEX IF NOT EXISTS idx_pos_channel_settlements_store_date
  ON public.pos_channel_settlements (store_code, settle_date);

-- 5) GROSS RPC (card_fee_amt 컬럼 필요 → 1) 선행)
CREATE OR REPLACE FUNCTION public.get_pos_channel_settlement_gross(
  p_store_code TEXT,
  p_settle_date DATE,
  p_channel TEXT
)
RETURNS TABLE (
  gross NUMERIC,
  order_count BIGINT,
  card_fee_total NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH orders AS (
    SELECT
      o.payment_card,
      o.payment_delivery_app,
      o.delivery_app_code,
      COALESCE(o.card_fee_amt, 0)::numeric AS card_fee_amt
    FROM public.pos_orders o
    WHERE o.store_code = p_store_code
      AND (o.created_at AT TIME ZONE 'Asia/Bangkok')::date = p_settle_date
      AND lower(coalesce(o.status, '')) IN ('paid', 'preparing', 'cooking', 'ready', 'completed')
  )
  SELECT
    CASE lower(trim(coalesce(p_channel, '')))
      WHEN 'card' THEN COALESCE(SUM(GREATEST(payment_card, 0)), 0)::numeric
      WHEN 'grab' THEN COALESCE(SUM(
        CASE
          WHEN GREATEST(payment_delivery_app, 0) > 0
            AND lower(coalesce(delivery_app_code, '')) LIKE '%grab%'
          THEN GREATEST(payment_delivery_app, 0)
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'lineman' THEN COALESCE(SUM(
        CASE
          WHEN GREATEST(payment_delivery_app, 0) > 0
            AND (
              lower(coalesce(delivery_app_code, '')) LIKE '%line%'
              OR lower(coalesce(delivery_app_code, '')) LIKE '%lineman%'
            )
          THEN GREATEST(payment_delivery_app, 0)
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'shopee' THEN COALESCE(SUM(
        CASE
          WHEN GREATEST(payment_delivery_app, 0) > 0
            AND lower(coalesce(delivery_app_code, '')) LIKE '%shopee%'
          THEN GREATEST(payment_delivery_app, 0)
          ELSE 0
        END
      ), 0)::numeric
      WHEN 'delivery_all' THEN COALESCE(SUM(GREATEST(payment_delivery_app, 0)), 0)::numeric
      ELSE 0::numeric
    END AS gross,
    COUNT(*)::bigint AS order_count,
    CASE lower(trim(coalesce(p_channel, '')))
      WHEN 'card' THEN COALESCE(SUM(GREATEST(card_fee_amt, 0)), 0)::numeric
      ELSE 0::numeric
    END AS card_fee_total
  FROM orders;
$$;


-- ============================================================
-- 12 sell_hall delivery packaging
-- source: sql/pos_menus_sell_channels.sql
-- ============================================================

-- POS 메뉴 채널 노출 플래그(홀/배달/포장)
-- 메뉴 정보 체크박스 + 메뉴 화면 구성 유형 필터 연동용

alter table if exists public.pos_menus
  add column if not exists sell_hall boolean not null default true;

alter table if exists public.pos_menus
  add column if not exists sell_delivery boolean not null default true;

alter table if exists public.pos_menus
  add column if not exists sell_packaging boolean not null default true;

comment on column public.pos_menus.sell_hall is '메뉴를 홀(매장 주문)에서 노출/판매할지 여부';
comment on column public.pos_menus.sell_delivery is '메뉴를 배달 주문에서 노출/판매할지 여부';
comment on column public.pos_menus.sell_packaging is '메뉴를 포장 주문에서 노출/판매할지 여부';


-- ============================================================
-- 13 drawer pin
-- source: sql/pos_printer_settings_drawer_pin.sql
-- ============================================================

-- 금전 서랍(돈통) 6자리 PIN — 매장별 pos_printer_settings
-- Supabase SQL Editor에서 실행 (idempotent).

ALTER TABLE IF EXISTS public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS drawer_pin_hash TEXT NULL;

COMMENT ON COLUMN public.pos_printer_settings.drawer_pin_hash IS '금전 서랍 수동/업무 오픈용 6자리 PIN bcrypt 해시. NULL이면 PIN 미설정(기존 동작).';


-- ============================================================
-- 13b customer display lang
-- source: sql/pos_dual_monitor_language_override.sql
-- ============================================================

-- 고객화면 언어: POS 언어 따라감 / 고객화면만 별도 고정
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS customer_display_lang_mode TEXT DEFAULT 'follow-pos',
  ADD COLUMN IF NOT EXISTS customer_display_lang_override TEXT DEFAULT '';

COMMENT ON COLUMN public.pos_printer_settings.customer_display_lang_mode IS 'follow-pos | custom';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_lang_override IS 'ko | en | th | mm | la | kh | vi | ms';


-- ============================================================
-- 14 banban flavor links
-- source: sql/pos_banban_flavor_links.sql
-- ============================================================

-- 반반 메뉴별 허용 맛(메뉴) whitelist
-- - 반반 메뉴와 일반 맛 메뉴를 직접 연결한다.
-- - 실제 반반 맛은 옵션 문자열이 아니라 pos_menus 행을 참조한다.

create table if not exists public.pos_banban_flavor_links (
  id bigserial primary key,
  banban_menu_id bigint not null references public.pos_menus(id) on delete cascade,
  flavor_menu_id bigint not null references public.pos_menus(id) on delete cascade,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_banban_flavor_links_unique unique (banban_menu_id, flavor_menu_id),
  constraint pos_banban_flavor_links_not_self check (banban_menu_id <> flavor_menu_id)
);

create index if not exists idx_pos_banban_flavor_links_banban_sort
  on public.pos_banban_flavor_links (banban_menu_id, sort_order asc, flavor_menu_id asc);

create index if not exists idx_pos_banban_flavor_links_flavor
  on public.pos_banban_flavor_links (flavor_menu_id, banban_menu_id);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_banban_flavor_links_updated_at on public.pos_banban_flavor_links;
create trigger trg_pos_banban_flavor_links_updated_at
before update on public.pos_banban_flavor_links
for each row execute function public.set_row_updated_at();

alter table public.pos_banban_flavor_links enable row level security;

drop policy if exists "pos_banban_flavor_links_allow_public" on public.pos_banban_flavor_links;
create policy "pos_banban_flavor_links_allow_public"
  on public.pos_banban_flavor_links
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_banban_flavor_links to anon, authenticated;
grant usage, select on sequence public.pos_banban_flavor_links_id_seq to anon, authenticated;


-- ============================================================
-- 15 payment method items
-- source: scripts/pos_payment_method_items.sql
-- ============================================================

-- POS 결제 수단 항목 (카드수기입력 항목관리)
-- 관리자 > POS 화면 구성 > 결제 기능에서 추가/수정/숨김
-- store_code null = 전역(모든 매장 공통)
create table if not exists public.pos_payment_method_items (
  id bigint generated by default as identity primary key,
  store_code text,
  category text not null default 'other' check (category in ('card', 'qr', 'delivery', 'other')),
  name text not null,
  hidden boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pos_payment_method_items_store on public.pos_payment_method_items(store_code);
create index if not exists idx_pos_payment_method_items_category on public.pos_payment_method_items(category);

-- 시드: 기본 항목 (글로벌) - 테이블 비어있을 때만
insert into public.pos_payment_method_items (store_code, category, name, hidden, sort_order)
select * from (values
  (null::text, 'card', 'Visa', false, 1),
  (null, 'card', 'Master', false, 2),
  (null, 'card', 'Amex', false, 3),
  (null, 'card', 'JCB', false, 4),
  (null, 'card', 'Other', false, 99),
  (null, 'qr', 'TrueMoney', false, 1),
  (null, 'qr', 'WeChat', false, 2),
  (null, 'qr', 'Alipay', false, 3),
  (null, 'qr', 'UnionPay', false, 4),
  (null, 'qr', 'PromptPay', false, 5),
  (null, 'qr', 'LINE Pay', false, 6),
  (null, 'qr', 'Shopee Pay', false, 7),
  (null, 'qr', 'Other', false, 99),
  (null, 'delivery', 'Grab', false, 1),
  (null, 'delivery', 'Line Man', false, 2),
  (null, 'delivery', 'Shopee', false, 3),
  (null, 'delivery', 'Other', false, 99),
  (null, 'other', 'Gift Voucher', false, 1),
  (null, 'other', 'Online Banking', false, 2),
  (null, 'other', 'Other', false, 99)
) v(store_code, category, name, hidden, sort_order)
where not exists (select 1 from public.pos_payment_method_items limit 1);


-- ============================================================
-- 16 wechat alipay unionpay
-- source: sql/pos_payment_method_items_wechat_alipay_unionpay.sql
-- ============================================================

-- POS 결제 수단: WeChat / Alipay / UnionPay (기존 DB에 없을 때만 추가)
-- The Street 등 pos_payment_method_items 전환 매장에서 「기타」탭 누락 복구용

insert into public.pos_payment_method_items (store_code, category, name, hidden, sort_order)
select v.store_code, v.category, v.name, v.hidden, v.sort_order
from (values
  (null::text, 'qr', 'WeChat', false, 2),
  (null, 'qr', 'Alipay', false, 3),
  (null, 'qr', 'UnionPay', false, 4)
) as v(store_code, category, name, hidden, sort_order)
where not exists (
  select 1 from public.pos_payment_method_items p
  where p.store_code is null and p.category = v.category and p.name = v.name
);


-- ============================================================
-- 17 delivery apps payment settings
-- source: scripts/pos_delivery_apps_schema.sql
-- ============================================================

-- POS 배달앱 설정 테이블
-- 실행 대상: Supabase SQL Editor (PostgreSQL)
-- 관리자 화면 "배달앱 관리" 탭에서 설정 저장

create table if not exists public.pos_delivery_apps (
  id bigint generated by default as identity primary key,
  code text not null,
  name text not null,
  match_keywords text[] not null default '{}',
  display_order integer not null default 0,
  enabled boolean not null default true,
  dine_out_enabled boolean not null default true,
  accent_color text,
  store_code text,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
  updated_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create unique index if not exists idx_pos_delivery_apps_code_store on public.pos_delivery_apps (code, coalesce(store_code, ''));
create index if not exists idx_pos_delivery_apps_store_code on public.pos_delivery_apps(store_code);
create index if not exists idx_pos_delivery_apps_enabled on public.pos_delivery_apps(enabled) where enabled = true;

-- 시드: Grab, Line Man, Shopee, Other (store_code null = 전역) - 테이블 비어있을 때만
insert into public.pos_delivery_apps (code, name, match_keywords, display_order, enabled, dine_out_enabled, accent_color, store_code)
select 'grab', 'Grab', array['grab', '그랩', 'grab food'], 1, true, true, 'lime', null
where not exists (select 1 from public.pos_delivery_apps limit 1)
union all select 'lineman', 'Line Man', array['lineman', 'line man', '라인맨', 'lineman wongnai'], 2, true, true, 'sky', null
where not exists (select 1 from public.pos_delivery_apps limit 1)
union all select 'shopee', 'Shopee', array['shopee', '쇼피', 'shopee food'], 3, true, true, 'amber', null
where not exists (select 1 from public.pos_delivery_apps limit 1)
union all select 'other', 'Other', array['other', '기타'], 99, true, true, 'slate', null
where not exists (select 1 from public.pos_delivery_apps limit 1);

-- POS 결제 수단 설정 (카드/QR breakdown 키) - store_code당 1행
create table if not exists public.pos_payment_settings (
  store_code text primary key,
  card_keys text[] not null default array['Visa', 'Master', 'Amex', 'JCB', 'Other'],
  qr_keys text[] not null default array['TrueMoney', 'WeChat', 'Alipay', 'PromptPay', 'LINE Pay', 'Shopee Pay', 'Other'],
  updated_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);


-- ============================================================
-- 18 menu screen config
-- source: scripts/pos_menu_screen_config_schema.sql
-- ============================================================

create table if not exists public.pos_menu_screen_configs (
  id bigserial primary key,
  store_code text null,
  main_category_font_size integer not null default 14,
  category_font_size integer not null default 13,
  menu_tile_font_size integer not null default 13,
  menu_tile_cols integer not null default 4,
  menu_list_font_size integer not null default 12,
  menu_list_page_size integer not null default 14,
  kiosk_group_font_size integer not null default 13,
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_menu_screen_configs_store_code_uidx
  on public.pos_menu_screen_configs ((coalesce(store_code, '')));


-- ============================================================
-- 19 stock receivable RPCs
-- source: sql/supabase_rpc_egress_helpers_deploy.sql
-- ============================================================

-- =============================================================================
-- Supabase SQL Editor 전용 (앱 배포 불필요)
-- 앱은 RPC 실패 시 기존 PostgREST select fallback — 화면·집계 로직 변경 없음.
-- 배포 후: Query Performance에서 get_store_stock / get_receivable_summary 등 calls 확인.
-- =============================================================================

-- 1) 재고 합계 · location 목록 (accounting-reports, getAppData, getStockStores)
CREATE OR REPLACE FUNCTION public.get_store_stock(
  p_location_patterns text[],
  p_as_of_date timestamptz DEFAULT NULL
)
RETURNS TABLE(item_code text, total_qty numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.item_code::text, SUM(sl.qty)::numeric
  FROM public.stock_logs sl
  WHERE
    (p_as_of_date IS NULL OR sl.log_date <= p_as_of_date)
    AND (
      p_location_patterns IS NULL
      OR cardinality(p_location_patterns) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(p_location_patterns) AS pat
        WHERE sl.location ILIKE pat
      )
    )
  GROUP BY sl.item_code;
$$;

CREATE OR REPLACE FUNCTION public.get_distinct_stock_locations()
RETURNS TABLE(location text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT sl.location::text
  FROM public.stock_logs sl
  WHERE sl.location IS NOT NULL AND btrim(sl.location) <> '';
$$;

-- 2) 미수 · 미지급 요약 (getReceivablePayableSummary)
CREATE OR REPLACE FUNCTION public.get_receivable_summary(
  p_store_filter text DEFAULT NULL,
  p_end_str text DEFAULT NULL
)
RETURNS TABLE(store_name text, balance numeric, item_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.store_name::text,
    SUM(r.amount)::numeric AS balance,
    COUNT(*)::bigint AS item_count
  FROM public.receivable_transactions r
  WHERE
    (p_store_filter IS NULL OR p_store_filter = '' OR r.store_name ILIKE p_store_filter)
    AND (p_end_str IS NULL OR p_end_str = '' OR r.trans_date::date <= p_end_str::date)
  GROUP BY r.store_name;
$$;

CREATE OR REPLACE FUNCTION public.get_payable_summary(
  p_vendor_filter text DEFAULT NULL,
  p_end_str text DEFAULT NULL
)
RETURNS TABLE(vendor_code text, balance numeric, item_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.vendor_code::text,
    SUM(p.amount)::numeric AS balance,
    COUNT(*)::bigint AS item_count
  FROM public.payable_transactions p
  WHERE
    (p_vendor_filter IS NULL OR p_vendor_filter = '' OR p.vendor_code ILIKE p_vendor_filter)
    AND (p_end_str IS NULL OR p_end_str = '' OR p.trans_date::date <= p_end_str::date)
  GROUP BY p.vendor_code;
$$;

-- 3) 매출 관리 매장 필터 DISTINCT (posSalesFilterOptions)
CREATE OR REPLACE FUNCTION public.get_pos_sales_filter_store_codes(
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz
)
RETURNS TABLE (store_code text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT btrim(COALESCE(o.store_code, ''))::text AS store_code
  FROM public.pos_orders o
  WHERE o.created_at >= p_start_utc
    AND o.created_at < p_end_utc_exclusive
    AND COALESCE(btrim(o.store_code), '') <> ''
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.get_store_stock(text[], timestamptz) IS
  '매장별 재고 합계. location ILIKE. p_as_of_date 상한(<=).';
COMMENT ON FUNCTION public.get_distinct_stock_locations() IS
  'stock_logs DISTINCT location.';
COMMENT ON FUNCTION public.get_receivable_summary(text, text) IS
  '미수금 store별 잔액 요약.';
COMMENT ON FUNCTION public.get_payable_summary(text, text) IS
  '미지급금 vendor별 잔액 요약.';
COMMENT ON FUNCTION public.get_pos_sales_filter_store_codes(timestamptz, timestamptz) IS
  '매출 관리 매장 필터 DISTINCT store_code.';

GRANT EXECUTE ON FUNCTION public.get_store_stock(text[], timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_distinct_stock_locations() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_receivable_summary(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payable_summary(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pos_sales_filter_store_codes(timestamptz, timestamptz) TO anon, authenticated, service_role;


-- ============================================================
-- 20 pos sales summary RPC
-- source: sql/get_pos_sales_period_summary_deploy.sql
-- ============================================================

-- POS 기간 매출 요약 RPC (완료/대기 건수·합계·현금)
-- Supabase SQL Editor에서 실행. 미배포 시 getPosTodaySales 는 기존 select 경로만 사용합니다.
-- 본문 정의: vercel-app/sql/pos_hardening_phase2.sql (섹션 get_pos_sales_period_summary)

CREATE OR REPLACE FUNCTION public.get_pos_sales_period_summary(
  p_start_utc TIMESTAMPTZ,
  p_end_utc_exclusive TIMESTAMPTZ,
  p_store_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  completed_count BIGINT,
  completed_total NUMERIC,
  completed_cash NUMERIC,
  pending_count BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_has_total boolean;
  v_has_total_amount boolean;
  v_has_payment_cash boolean;
  v_has_store_code boolean;
  v_has_store_name boolean;
  v_has_status boolean;
  v_total_expr text;
  v_cash_expr text;
  v_store_expr text;
  v_status_expr text;
  v_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'total'
  ) INTO v_has_total;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'total_amount'
  ) INTO v_has_total_amount;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'payment_cash'
  ) INTO v_has_payment_cash;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_code'
  ) INTO v_has_store_code;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_name'
  ) INTO v_has_store_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'status'
  ) INTO v_has_status;

  v_total_expr := 'COALESCE((o.payload->>''total'')::numeric, (o.payload->>''totalAmount'')::numeric, 0)';
  IF v_has_total THEN
    v_total_expr := 'COALESCE(o.total, ' || v_total_expr || ')';
  ELSIF v_has_total_amount THEN
    v_total_expr := 'COALESCE(o.total_amount, ' || v_total_expr || ')';
  END IF;

  v_cash_expr := 'COALESCE((o.payload->>''paymentCash'')::numeric, (o.payload->>''payment_cash'')::numeric, 0)';
  IF v_has_payment_cash THEN
    v_cash_expr := 'COALESCE(o.payment_cash, ' || v_cash_expr || ')';
  END IF;

  IF v_has_store_code THEN
    v_store_expr := 'COALESCE(o.store_code, '''')';
  ELSIF v_has_store_name THEN
    v_store_expr := 'COALESCE(o.store_name, '''')';
  ELSE
    v_store_expr := 'COALESCE((o.payload->>''storeCode''), (o.payload->>''store_code''), '''')';
  END IF;

  IF v_has_status THEN
    v_status_expr := 'LOWER(COALESCE(o.status, ''''))';
  ELSE
    v_status_expr := 'LOWER(COALESCE((o.payload->>''status''), ''''))';
  END IF;

  v_sql := '
    WITH base AS (
      SELECT
        ' || v_status_expr || ' AS status,
        (' || v_total_expr || ')::numeric AS total,
        (' || v_cash_expr || ')::numeric AS payment_cash
      FROM public.pos_orders o
      WHERE o.created_at >= $1
        AND o.created_at < $2
        AND (
          $3 IS NULL
          OR COALESCE(array_length($3, 1), 0) = 0
          OR (' || v_store_expr || ') = ANY ($3)
        )
    )
    SELECT
      COUNT(*) FILTER (WHERE status IN (''completed'', ''paid'', ''ready''))::bigint AS completed_count,
      COALESCE(SUM(total) FILTER (WHERE status IN (''completed'', ''paid'', ''ready'')), 0)::numeric AS completed_total,
      COALESCE(SUM(payment_cash) FILTER (WHERE status IN (''completed'', ''paid'', ''ready'')), 0)::numeric AS completed_cash,
      COUNT(*) FILTER (WHERE status IN (''pending'', ''cooking''))::bigint AS pending_count
    FROM base
  ';

  RETURN QUERY EXECUTE v_sql USING p_start_utc, p_end_utc_exclusive, p_store_codes;
END;
$$;

COMMENT ON FUNCTION public.get_pos_sales_period_summary(timestamptz, timestamptz, text[]) IS
  'POS 매출 요약: 완료/대기 건수·합계·현금. getPosTodaySales RPC 경로(단일 매장·단일 영업일)용.';

GRANT EXECUTE ON FUNCTION public.get_pos_sales_period_summary(timestamptz, timestamptz, text[]) TO anon, authenticated, service_role;


-- ============================================================
-- 21 members CRM
-- source: sql/members_crm_scale_phase1_to_4.sql
-- ============================================================

-- 회원/CRM 30만 확장 공통 마이그레이션
-- 목적:
-- 1) 회원 필수 필드 확장(국적/가입경로/추천인)
-- 2) 회원 포털 OTP/세션 테이블
-- 3) 포인트 원장 멱등 인덱스
-- 4) CRM 요약/세그먼트/RFM RPC
-- 실행: Supabase SQL Editor

alter table public.members
  add column if not exists full_name text,
  add column if not exists birth_date text,
  add column if not exists gender text,
  add column if not exists tier_code text default 'BRONZE',
  add column if not exists point_balance integer not null default 0,
  add column if not exists lifetime_amount numeric(14,2) not null default 0,
  add column if not exists nationality text,
  add column if not exists join_channel text default 'store',
  add column if not exists referred_by_member_id bigint references public.members(id) on delete set null,
  add column if not exists referral_code text,
  add column if not exists last_visited_at timestamp without time zone;

-- LINE Customer report 원본 컬럼 보존용
alter table public.members
  add column if not exists line_member_type text,
  add column if not exists line_first_name text,
  add column if not exists line_last_name text,
  add column if not exists line_address text,
  add column if not exists line_subdistrict text,
  add column if not exists line_district text,
  add column if not exists line_province text,
  add column if not exists line_postcode text,
  add column if not exists line_membership_tier text,
  add column if not exists line_member_tag text,
  add column if not exists line_member_branch text,
  add column if not exists line_current_points integer,
  add column if not exists line_total_points integer,
  add column if not exists line_tier_points integer,
  add column if not exists line_usage_count integer,
  add column if not exists line_last_active_at timestamp without time zone,
  add column if not exists line_last_active_days integer,
  add column if not exists line_member_status text,
  add column if not exists line_registered_at timestamp without time zone,
  add column if not exists line_exported_at timestamp without time zone;

create unique index if not exists uq_members_referral_code
  on public.members (referral_code)
  where referral_code is not null;

create index if not exists idx_members_join_channel on public.members(join_channel);
create index if not exists idx_members_last_visited_at on public.members(last_visited_at desc);
create index if not exists idx_members_referred_by on public.members(referred_by_member_id);

-- 전화번호 정규화 검색/중복 방지(값이 있을 때만)
create unique index if not exists uq_members_phone_digits
  on public.members ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')))
  where nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') is not null;

-- 선행 스키마가 없는 환경에서도 실행되도록 최소 로열티 테이블 보장
create table if not exists public.member_points_ledger (
  id bigint generated by default as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  order_id bigint,
  kind text not null, -- earn/use/adjust/reverse
  points integer not null,
  amount numeric(14,2) not null default 0,
  note text,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_member_points_ledger_member_id on public.member_points_ledger(member_id);
create index if not exists idx_member_points_ledger_order_id on public.member_points_ledger(order_id);

-- 포인트 원장 멱등성: 동일 주문에서 같은 kind 1회만 반영
create unique index if not exists uq_member_points_ledger_member_order_kind
  on public.member_points_ledger(member_id, order_id, kind)
  where order_id is not null;

create table if not exists public.member_login_otps (
  id bigint generated by default as identity primary key,
  phone text not null,
  otp_hash text not null,
  expires_at timestamp without time zone not null,
  verified_at timestamp without time zone,
  tries integer not null default 0,
  status text not null default 'issued', -- issued/verified/expired/blocked
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_member_login_otps_phone_created_at
  on public.member_login_otps(phone, created_at desc);

create table if not exists public.member_sessions (
  id bigint generated by default as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  session_token_hash text not null unique,
  device_label text,
  user_agent text,
  ip text,
  expires_at timestamp without time zone not null,
  revoked_at timestamp without time zone,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
  last_seen_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_member_sessions_member_id on public.member_sessions(member_id);
create index if not exists idx_member_sessions_expires_at on public.member_sessions(expires_at);

create table if not exists public.member_notes (
  id bigint generated by default as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  note text not null,
  tags text[] not null default '{}',
  created_by text,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_member_notes_member_id on public.member_notes(member_id);

create table if not exists public.member_referral_events (
  id bigint generated by default as identity primary key,
  referrer_member_id bigint not null references public.members(id) on delete cascade,
  referred_member_id bigint not null references public.members(id) on delete cascade,
  referrer_points integer not null default 0,
  referred_points integer not null default 0,
  status text not null default 'approved', -- pending/approved/rejected
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
  unique(referrer_member_id, referred_member_id)
);

create index if not exists idx_member_referral_events_referrer on public.member_referral_events(referrer_member_id);
create index if not exists idx_member_referral_events_referred on public.member_referral_events(referred_member_id);

create table if not exists public.line_import_jobs (
  id text primary key,
  report_type text not null, -- customer / point / coupon
  file_name text not null,
  row_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  created_by text,
  exported_at timestamp without time zone,
  shop_name text,
  menu_name text,
  period_start date,
  period_end date,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create table if not exists public.line_import_rows (
  id bigint generated by default as identity primary key,
  job_id text not null references public.line_import_jobs(id) on delete cascade,
  row_no integer not null,
  report_type text not null,
  line_display_name text,
  phone text,
  full_name text,
  transaction_id text,
  coupon_code text,
  points integer,
  status text not null, -- success / failed / skipped
  message text,
  raw_payload jsonb,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_line_import_rows_job_id on public.line_import_rows(job_id);
create index if not exists idx_line_import_rows_phone on public.line_import_rows(phone);

create or replace function public.get_member_list_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null
)
returns table (
  id bigint,
  member_no text,
  name text,
  full_name text,
  phone text,
  email text,
  birth_date text,
  gender text,
  nationality text,
  tier_code text,
  point_balance integer,
  lifetime_amount numeric,
  join_channel text,
  created_at timestamp without time zone
)
language sql
stable
as $$
  select
    m.id,
    m.member_no,
    m.name,
    m.full_name,
    m.phone,
    m.email,
    m.birth_date,
    m.gender,
    m.nationality,
    m.tier_code,
    m.point_balance,
    m.lifetime_amount,
    m.join_channel,
    m.created_at
  from public.members m
  where
    (p_after_id is null or m.id < p_after_id)
    and (
      coalesce(trim(p_q), '') = ''
      or m.name ilike ('%' || p_q || '%')
      or coalesce(m.full_name, '') ilike ('%' || p_q || '%')
      or coalesce(m.phone, '') ilike ('%' || p_q || '%')
      or coalesce(m.member_no, '') ilike ('%' || p_q || '%')
      or coalesce(m.email, '') ilike ('%' || p_q || '%')
    )
  order by m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.get_member_crm_summary(
  p_recent_days integer default 30,
  p_dormant_days integer default 90
)
returns table (
  total_members bigint,
  recent_active_members bigint,
  dormant_members bigint,
  total_lifetime_amount numeric,
  avg_order_amount numeric
)
language sql
stable
as $$
  with orders as (
    select
      o.member_id,
      o.total,
      o.created_at
    from public.pos_orders o
    where coalesce(o.member_id, 0) > 0
  ),
  recent_active as (
    select count(distinct member_id) as c
    from orders
    where created_at >= ((now() at time zone 'Asia/Bangkok') - make_interval(days => greatest(p_recent_days, 1)))
  ),
  dormant as (
    select count(*) as c
    from public.members m
    where not exists (
      select 1
      from orders o
      where o.member_id = m.id
        and o.created_at >= ((now() at time zone 'Asia/Bangkok') - make_interval(days => greatest(p_dormant_days, 1)))
    )
  )
  select
    (select count(*) from public.members) as total_members,
    coalesce((select c from recent_active), 0) as recent_active_members,
    coalesce((select c from dormant), 0) as dormant_members,
    coalesce((select sum(lifetime_amount) from public.members), 0) as total_lifetime_amount,
    coalesce((select avg(total) from orders), 0) as avg_order_amount;
$$;

create or replace function public.get_member_rfm_scores(
  p_limit integer default 5000
)
returns table (
  member_id bigint,
  recency_days integer,
  frequency_count integer,
  monetary_amount numeric,
  r_score integer,
  f_score integer,
  m_score integer,
  rfm_score text
)
language sql
stable
as $$
  with base as (
    select
      m.id as member_id,
      coalesce(
        floor(extract(epoch from ((now() at time zone 'Asia/Bangkok') - max(o.created_at))) / 86400)::int,
        9999
      ) as recency_days,
      coalesce(count(o.id), 0)::int as frequency_count,
      coalesce(sum(o.total), 0)::numeric as monetary_amount
    from public.members m
    left join public.pos_orders o
      on o.member_id = m.id
    group by m.id
  ),
  scored as (
    select
      b.*,
      ntile(5) over (order by b.recency_days asc) as r_score,
      ntile(5) over (order by b.frequency_count desc) as f_score,
      ntile(5) over (order by b.monetary_amount desc) as m_score
    from base b
  )
  select
    s.member_id,
    s.recency_days,
    s.frequency_count,
    s.monetary_amount,
    s.r_score,
    s.f_score,
    s.m_score,
    (s.r_score::text || s.f_score::text || s.m_score::text) as rfm_score
  from scored s
  order by s.r_score desc, s.f_score desc, s.m_score desc, s.member_id desc
  limit greatest(1, least(coalesce(p_limit, 5000), 20000));
$$;


-- ============================================================
-- 22 member portal CMS
-- source: sql/member_portal_content_cms.sql
-- ============================================================

-- Member Portal CMS content (popup / info / store photo)
create table if not exists public.member_portal_content (
  id bigserial primary key,
  content_key text not null unique,
  content_type text not null check (content_type in ('popup', 'info', 'store_photo')),
  store_code text,
  title text,
  body text,
  image_url text,
  target_tab text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_member_portal_content_type_active
  on public.member_portal_content (content_type, is_active, sort_order, updated_at desc);

create index if not exists idx_member_portal_content_store
  on public.member_portal_content (store_code);


-- ============================================================
-- END supabase_one_paste_all_in_one.sql
-- ============================================================
