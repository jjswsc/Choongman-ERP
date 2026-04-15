-- ============================================================
-- Accounting/Tax upgrade one-shot migration
-- 목적: 아래 변경사항을 "한 번에 붙여넣기 실행"할 수 있도록 통합
-- - VAT/WHT 원장 제출 상태 컬럼
-- - WHT store_name 컬럼
-- - 회계기간 잠금해제 승인 컬럼
-- - 수익/비용 마감 이력 테이블
-- - 신고 워크플로 period_type/period_key/store_scope 정규화
-- - 권한/확정 감사로그 테이블
-- - 워크플로 구조화 이벤트 테이블 (SSO/E-Tax note JSON 정규화)
-- ============================================================
-- 실행 방법 (운영 권장)
-- 1) DB 백업(스냅샷) 후 실행
-- 2) Supabase SQL Editor에 파일 전체를 한 번에 붙여넣고 실행
-- 3) 실행 후 아래 "사후 검증 쿼리"를 순서대로 확인
--
-- 사후 검증 쿼리(참고용, 실행은 COMMIT 이후 별도)
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='accounting_filing_workflow_status'
--    AND column_name IN ('period_type','period_key','store_scope');
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='accounting_periods'
--    AND column_name IN ('unlocked_at','unlocked_by','unlock_reason','unlock_approved_by');
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='vat_ledger_entries'
--    AND column_name IN ('filing_status','submitted_at','submitted_by');
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='withholding_tax_ledger_entries'
--    AND column_name IN ('filing_status','submitted_at','submitted_by','store_name');
--
-- SELECT to_regclass('public.income_expense_closing_runs') AS closing_runs_table;
--
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname='public' AND tablename='accounting_filing_workflow_status'
--    AND indexname='uq_accounting_filing_workflow_period_scope';

BEGIN;

-- ------------------------------------------------------------
-- 1) VAT/WHT 원장 제출 상태 확장
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.vat_ledger_entries') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE public.vat_ledger_entries
        ADD COLUMN IF NOT EXISTS filing_status TEXT NULL,
        ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS submitted_by TEXT NULL
    $sql$;

    EXECUTE $sql$
      UPDATE public.vat_ledger_entries
      SET filing_status = 'draft'
      WHERE filing_status IS NULL OR btrim(filing_status) = ''
    $sql$;

    EXECUTE $sql$
      UPDATE public.vat_ledger_entries
      SET submitted_at = NULL,
          submitted_by = NULL
      WHERE filing_status <> 'submitted'
    $sql$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'vat_ledger_entries_filing_status_check'
    ) THEN
      EXECUTE $sql$
        ALTER TABLE public.vat_ledger_entries
          ADD CONSTRAINT vat_ledger_entries_filing_status_check
          CHECK (filing_status IS NULL OR filing_status IN ('draft', 'submitted'))
      $sql$;
    END IF;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_vat_ledger_filing_status
        ON public.vat_ledger_entries (tax_month, filing_status)
    $sql$;
  ELSE
    RAISE NOTICE 'SKIP: public.vat_ledger_entries not found.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.withholding_tax_ledger_entries') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE public.withholding_tax_ledger_entries
        ADD COLUMN IF NOT EXISTS filing_status TEXT NULL,
        ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS submitted_by TEXT NULL,
        ADD COLUMN IF NOT EXISTS store_name TEXT NULL
    $sql$;

    EXECUTE $sql$
      UPDATE public.withholding_tax_ledger_entries
      SET filing_status = 'draft'
      WHERE filing_status IS NULL OR btrim(filing_status) = ''
    $sql$;

    EXECUTE $sql$
      UPDATE public.withholding_tax_ledger_entries
      SET submitted_at = NULL,
          submitted_by = NULL
      WHERE filing_status <> 'submitted'
    $sql$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'withholding_tax_ledger_entries_filing_status_check'
    ) THEN
      EXECUTE $sql$
        ALTER TABLE public.withholding_tax_ledger_entries
          ADD CONSTRAINT withholding_tax_ledger_entries_filing_status_check
          CHECK (filing_status IS NULL OR filing_status IN ('draft', 'submitted'))
      $sql$;
    END IF;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_wht_ledger_filing_status
        ON public.withholding_tax_ledger_entries (tax_month, filing_status)
    $sql$;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month_store
        ON public.withholding_tax_ledger_entries (tax_month, store_name)
    $sql$;
  ELSE
    RAISE NOTICE 'SKIP: public.withholding_tax_ledger_entries not found.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) 회계기간 잠금해제 승인 컬럼
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.accounting_periods') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NULL';
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlocked_by TEXT NULL';
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlock_reason TEXT NULL';
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlock_approved_by TEXT NULL';
  ELSE
    RAISE NOTICE 'SKIP: public.accounting_periods not found.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) 수익/비용 마감 이력 테이블
-- ------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_income_expense_closing_runs_status
  ON public.income_expense_closing_runs (status, created_at DESC);

ALTER TABLE public.income_expense_closing_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for income_expense_closing_runs" ON public.income_expense_closing_runs;
CREATE POLICY "Allow all for income_expense_closing_runs"
ON public.income_expense_closing_runs
FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 4) 신고 워크플로 기간 키 정규화
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.accounting_filing_workflow_status') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT ''monthly''';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD COLUMN IF NOT EXISTS period_key text NOT NULL DEFAULT ''''';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD COLUMN IF NOT EXISTS store_scope text NOT NULL DEFAULT ''*''';
  ELSE
    RAISE NOTICE 'SKIP: public.accounting_filing_workflow_status not found.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_filing_workflow_status') IS NOT NULL THEN
    EXECUTE 'UPDATE public.accounting_filing_workflow_status SET period_type = ''monthly'' WHERE COALESCE(period_type, '''') = ''''';
    EXECUTE 'UPDATE public.accounting_filing_workflow_status SET period_key = year_month WHERE COALESCE(period_key, '''') = ''''';
    EXECUTE 'UPDATE public.accounting_filing_workflow_status SET store_scope = ''*'' WHERE COALESCE(store_scope, '''') = ''''';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_filing_workflow_status') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status DROP CONSTRAINT IF EXISTS accounting_filing_workflow_status_year_month_filing_type_key';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status DROP CONSTRAINT IF EXISTS accounting_filing_workflow_status_period_ck';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD CONSTRAINT accounting_filing_workflow_status_period_ck CHECK (period_type IN (''monthly'', ''half_year'', ''annual''))';
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_accounting_filing_workflow_ym_type_store;
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_filing_workflow_period_scope
  ON public.accounting_filing_workflow_status (period_type, period_key, filing_type, store_scope);

CREATE INDEX IF NOT EXISTS idx_accounting_filing_workflow_period
  ON public.accounting_filing_workflow_status (period_type, period_key);

-- ------------------------------------------------------------
-- 5) 권한/확정 감사 로그
-- ------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_accounting_compliance_audit_action
  ON public.accounting_compliance_audit_logs (action_type, decision, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_compliance_audit_period
  ON public.accounting_compliance_audit_logs (year_month, period_type, period_key, store_scope);

ALTER TABLE public.accounting_compliance_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_compliance_audit_logs" ON public.accounting_compliance_audit_logs;
CREATE POLICY "Allow all accounting_compliance_audit_logs"
ON public.accounting_compliance_audit_logs
FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 6) 워크플로 구조화 이벤트 (SSO/E-Tax)
-- ------------------------------------------------------------
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

ALTER TABLE public.accounting_workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_workflow_events" ON public.accounting_workflow_events;
CREATE POLICY "Allow all accounting_workflow_events"
ON public.accounting_workflow_events
FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 7) 감사로그 월별 추세 RPC
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 8) 태국 신고 요약 집계 RPC (VAT/WHT)
-- ------------------------------------------------------------
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
  SELECT
    COALESCE(v.direction, '') AS direction,
    COALESCE(v.net_amount, 0)::NUMERIC AS net_amount,
    COALESCE(v.vat_amount, 0)::NUMERIC AS vat_amount,
    COALESCE(v.counterparty_tax_id, '') AS counterparty_tax_id,
    COALESCE(v.invoice_number, '') AS invoice_number
  FROM public.vat_ledger_entries v
  JOIN month_list m ON m.tax_month = v.tax_month
  WHERE COALESCE(NULLIF(trim(p_store_name), ''), 'All') IN ('All', '*')
    OR v.store_name = trim(p_store_name)
),
vat_agg AS (
  SELECT
    COALESCE(SUM(CASE WHEN lower(direction) = 'output' THEN net_amount ELSE 0 END), 0) AS output_net,
    COALESCE(SUM(CASE WHEN lower(direction) = 'output' THEN vat_amount ELSE 0 END), 0) AS output_vat,
    COALESCE(SUM(CASE WHEN lower(direction) <> 'output' THEN net_amount ELSE 0 END), 0) AS input_net,
    COALESCE(SUM(CASE WHEN lower(direction) <> 'output' THEN vat_amount ELSE 0 END), 0) AS input_vat,
    COUNT(*) FILTER (WHERE trim(counterparty_tax_id) = '')::BIGINT AS missing_tax_id_count,
    COUNT(*) FILTER (WHERE trim(invoice_number) = '')::BIGINT AS missing_invoice_count,
    COUNT(*)::BIGINT AS row_count
  FROM vat_filtered
),
wht_filtered AS (
  SELECT
    upper(COALESCE(NULLIF(trim(w.form_hint), ''), 'PND53')) AS form_hint,
    COALESCE(w.gross_amount, 0)::NUMERIC AS gross_amount,
    COALESCE(w.wht_amount, 0)::NUMERIC AS wht_amount,
    COALESCE(w.payee_tax_id, '') AS payee_tax_id,
    COALESCE(w.certificate_no, '') AS certificate_no
  FROM public.withholding_tax_ledger_entries w
  JOIN month_list m ON m.tax_month = w.tax_month
  WHERE COALESCE(NULLIF(trim(p_store_name), ''), 'All') IN ('All', '*')
    OR w.store_name = trim(p_store_name)
),
wht_form_agg AS (
  SELECT
    form_hint,
    COALESCE(SUM(gross_amount), 0) AS gross,
    COALESCE(SUM(wht_amount), 0) AS withheld,
    COUNT(*)::BIGINT AS rows
  FROM wht_filtered
  GROUP BY form_hint
),
wht_total_agg AS (
  SELECT
    COALESCE(SUM(gross_amount), 0) AS total_gross,
    COALESCE(SUM(wht_amount), 0) AS total_withheld,
    COUNT(*) FILTER (WHERE trim(payee_tax_id) = '')::BIGINT AS missing_tax_id_count,
    COUNT(*) FILTER (WHERE trim(certificate_no) = '')::BIGINT AS missing_certificate_count,
    COUNT(*)::BIGINT AS row_count
  FROM wht_filtered
),
wht_json AS (
  SELECT COALESCE(
    jsonb_object_agg(form_hint, jsonb_build_object('gross', gross, 'withheld', withheld, 'rows', rows)),
    '{}'::jsonb
  ) AS by_form
  FROM wht_form_agg
)
SELECT
  va.output_net AS vat_output_net,
  va.output_vat AS vat_output_vat,
  va.input_net AS vat_input_net,
  va.input_vat AS vat_input_vat,
  (va.output_vat - va.input_vat) AS vat_payable_vat,
  va.missing_tax_id_count AS vat_missing_tax_id_count,
  va.missing_invoice_count AS vat_missing_invoice_count,
  va.row_count AS vat_row_count,
  wt.total_gross AS wht_total_gross,
  wt.total_withheld AS wht_total_withheld,
  wt.missing_tax_id_count AS wht_missing_tax_id_count,
  wt.missing_certificate_count AS wht_missing_certificate_count,
  wt.row_count AS wht_row_count,
  wj.by_form AS wht_by_form
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
         COALESCE(p.salary, 0)::NUMERIC AS salary,
         (COALESCE(p.pos_allow, 0)+COALESCE(p.haz_allow, 0)+COALESCE(p.diligence_allow, 0)+COALESCE(p.birth_bonus, 0)+COALESCE(p.spl_bonus, 0)+COALESCE(p.ot_amt, 0)+COALESCE(p.holiday_pay, 0))::NUMERIC AS other_comp
  FROM public.payroll_records p
  WHERE left(COALESCE(p.month, ''), 4)::INT = p_year
    AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(p.store, '') = trim(p_store))
    AND (lower(COALESCE(p.status, '')) IN ('paid', 'done', 'completed') OR lower(COALESCE(p.status, '')) LIKE '%paid%' OR COALESCE(p.status, '') LIKE '%ชำระ%')
),
emp_month_totals AS (
  SELECT r.month, CASE WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '') END AS emp_key,
         SUM(r.salary + r.other_comp)::NUMERIC AS emp_total
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
  WHERE left(COALESCE(w.tax_month, ''), 4)::INT = p_year
    AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(w.store_name, '') = trim(p_store))
    AND (lower(replace(COALESCE(w.form_hint, ''), ' ', '')) LIKE '%pnd1a%' OR lower(COALESCE(w.form_hint, '')) LIKE '%1ก%' OR COALESCE(w.form_hint, '') LIKE '%ภ.ง.ด.1ก%')
),
pnd1a_monthly AS (SELECT month, SUM(gross_amount)::NUMERIC AS pnd1a_ledger_gross FROM pnd1a_rows GROUP BY month)
SELECT m.month,
       COALESCE(mp.employee_count, 0)::BIGINT AS employee_count,
       ROUND(COALESCE(mp.salary_amount, 0), 2) AS salary_amount,
       ROUND(COALESCE(mp.daily_wage_amount, 0), 2) AS daily_wage_amount,
       ROUND(COALESCE(mp.other_comp_amount, 0), 2) AS other_comp_amount,
       ROUND(COALESCE(mp.total_wage, 0), 2) AS total_wage,
       ROUND(COALESCE(me.excess_over_20000, 0), 2) AS excess_over_20000,
       ROUND(COALESCE(mp.total_wage, 0) - COALESCE(me.excess_over_20000, 0), 2) AS net_wage_to_report,
       ROUND(COALESCE(pm.pnd1a_ledger_gross, 0), 2) AS pnd1a_ledger_gross,
       ROUND(COALESCE(mp.total_wage, 0) - COALESCE(pm.pnd1a_ledger_gross, 0), 2) AS diff_total_vs_pnd1a,
       ROUND((COALESCE(mp.total_wage, 0) - COALESCE(me.excess_over_20000, 0)) - COALESCE(pm.pnd1a_ledger_gross, 0), 2) AS diff_net_vs_pnd1a
FROM months m
LEFT JOIN monthly_payroll_agg mp ON mp.month = m.month
LEFT JOIN monthly_excess me ON me.month = m.month
LEFT JOIN pnd1a_monthly pm ON pm.month = m.month
ORDER BY m.month ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_kt20k_employee_diff_top(p_year INTEGER, p_store TEXT DEFAULT 'All', p_limit INTEGER DEFAULT 50)
RETURNS TABLE (employee_key TEXT, name TEXT, store TEXT, kt20k_total_wage NUMERIC, pnd1a_ledger_gross NUMERIC, diff NUMERIC, reason_tags JSONB)
LANGUAGE sql
AS $$
WITH kt20k_emp AS (
  SELECT COALESCE(p.store, '') AS store, COALESCE(p.name, '') AS name,
         SUM(COALESCE(p.salary, 0)+COALESCE(p.pos_allow, 0)+COALESCE(p.haz_allow, 0)+COALESCE(p.diligence_allow, 0)+COALESCE(p.birth_bonus, 0)+COALESCE(p.spl_bonus, 0)+COALESCE(p.ot_amt, 0)+COALESCE(p.holiday_pay, 0))::NUMERIC AS total_wage
  FROM public.payroll_records p
  WHERE left(COALESCE(p.month, ''), 4)::INT = p_year
    AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(p.store, '') = trim(p_store))
    AND (lower(COALESCE(p.status, '')) IN ('paid', 'done', 'completed') OR lower(COALESCE(p.status, '')) LIKE '%paid%' OR COALESCE(p.status, '') LIKE '%ชำระ%')
  GROUP BY COALESCE(p.store, ''), COALESCE(p.name, '')
),
pnd1a_emp AS (
  SELECT COALESCE(w.store_name, '') AS store, COALESCE(w.payee_name, '') AS name, SUM(COALESCE(w.gross_amount, 0))::NUMERIC AS total_gross
  FROM public.withholding_tax_ledger_entries w
  WHERE left(COALESCE(w.tax_month, ''), 4)::INT = p_year
    AND (COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*') OR COALESCE(w.store_name, '') = trim(p_store))
    AND (lower(replace(COALESCE(w.form_hint, ''), ' ', '')) LIKE '%pnd1a%' OR lower(COALESCE(w.form_hint, '')) LIKE '%1ก%' OR COALESCE(w.form_hint, '') LIKE '%ภ.ง.ด.1ก%')
  GROUP BY COALESCE(w.store_name, ''), COALESCE(w.payee_name, '')
),
joined AS (
  SELECT COALESCE(k.store, p.store) AS store, COALESCE(k.name, p.name) AS name, COALESCE(k.total_wage, 0)::NUMERIC AS kt20k_total_wage, COALESCE(p.total_gross, 0)::NUMERIC AS pnd1a_ledger_gross
  FROM kt20k_emp k FULL OUTER JOIN pnd1a_emp p ON p.store = k.store AND p.name = k.name
),
tagged AS (
  SELECT (store || '|' || name) AS employee_key, name, store, ROUND(kt20k_total_wage, 2) AS kt20k_total_wage, ROUND(pnd1a_ledger_gross, 2) AS pnd1a_ledger_gross,
         ROUND(kt20k_total_wage - pnd1a_ledger_gross, 2) AS diff,
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
