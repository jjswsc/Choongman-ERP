-- 회계 마감·태국 신고 보조·부속장부·은행 대사
-- Supabase SQL Editor에서 실행 후 RLS 정책은 환경에 맞게 조정하세요.

-- 1) 회계 연월 마감
CREATE TABLE IF NOT EXISTS accounting_periods (
  year_month TEXT PRIMARY KEY,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ NULL,
  closed_by TEXT NULL,
  unlocked_at TIMESTAMPTZ NULL,
  unlocked_by TEXT NULL,
  unlock_reason TEXT NULL,
  unlock_approved_by TEXT NULL
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
  filing_status TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  submitted_by TEXT NULL,
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
  filing_status TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  submitted_by TEXT NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month ON withholding_tax_ledger_entries(tax_month);

ALTER TABLE withholding_tax_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all withholding_tax_ledger_entries" ON withholding_tax_ledger_entries;
CREATE POLICY "Allow all withholding_tax_ledger_entries" ON withholding_tax_ledger_entries FOR ALL USING (true) WITH CHECK (true);

-- 5) 수익/비용 마감 문서 이력
CREATE TABLE IF NOT EXISTS income_expense_closing_runs (
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
  ON income_expense_closing_runs(year_month, store_scope, created_at DESC);

ALTER TABLE income_expense_closing_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for income_expense_closing_runs" ON income_expense_closing_runs;
CREATE POLICY "Allow all for income_expense_closing_runs" ON income_expense_closing_runs FOR ALL USING (true) WITH CHECK (true);

-- note JSON 정규화용 워크플로 이벤트
CREATE TABLE IF NOT EXISTS accounting_workflow_events (
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
  ON accounting_workflow_events (year_month, period_type, period_key, store_scope, filing_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_workflow_events_event
  ON accounting_workflow_events (event_type, occurred_at DESC);

ALTER TABLE accounting_workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_workflow_events" ON accounting_workflow_events;
CREATE POLICY "Allow all accounting_workflow_events" ON accounting_workflow_events FOR ALL USING (true) WITH CHECK (true);

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

-- 6) 은행 거래 대사
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(reconciled_at);
