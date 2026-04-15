-- KT20K 요약/대사 집계 RPC

CREATE OR REPLACE FUNCTION public.get_kt20k_monthly_agg(
  p_year INTEGER,
  p_store TEXT DEFAULT 'All'
)
RETURNS TABLE (
  month TEXT,
  employee_count BIGINT,
  salary_amount NUMERIC,
  daily_wage_amount NUMERIC,
  other_comp_amount NUMERIC,
  total_wage NUMERIC,
  excess_over_20000 NUMERIC,
  net_wage_to_report NUMERIC,
  pnd1a_ledger_gross NUMERIC,
  diff_total_vs_pnd1a NUMERIC,
  diff_net_vs_pnd1a NUMERIC
)
LANGUAGE sql
AS $$
WITH months AS (
  SELECT to_char(make_date(p_year, gs.m, 1), 'YYYY-MM') AS month
  FROM generate_series(1, 12) AS gs(m)
),
paid_rows AS (
  SELECT
    left(COALESCE(p.month, ''), 7) AS month,
    COALESCE(p.store, '') AS store,
    COALESCE(p.name, '') AS name,
    COALESCE(p.employee_id, 0) AS employee_id,
    COALESCE(p.salary, 0)::NUMERIC AS salary,
    (
      COALESCE(p.pos_allow, 0) +
      COALESCE(p.haz_allow, 0) +
      COALESCE(p.diligence_allow, 0) +
      COALESCE(p.birth_bonus, 0) +
      COALESCE(p.spl_bonus, 0) +
      COALESCE(p.ot_amt, 0) +
      COALESCE(p.holiday_pay, 0)
    )::NUMERIC AS other_comp
  FROM public.payroll_records p
  WHERE
    left(COALESCE(p.month, ''), 4)::INT = p_year
    AND (
      COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*')
      OR COALESCE(p.store, '') = trim(p_store)
    )
    AND (
      lower(COALESCE(p.status, '')) IN ('paid', 'done', 'completed')
      OR lower(COALESCE(p.status, '')) LIKE '%paid%'
      OR COALESCE(p.status, '') LIKE '%ชำระ%'
    )
),
emp_month_totals AS (
  SELECT
    r.month,
    CASE
      WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT
      ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '')
    END AS emp_key,
    SUM(r.salary + r.other_comp)::NUMERIC AS emp_total
  FROM paid_rows r
  GROUP BY r.month, CASE
      WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT
      ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '')
    END
),
monthly_payroll_agg AS (
  SELECT
    r.month,
    COUNT(DISTINCT CASE
      WHEN r.employee_id::INT > 0 THEN '#' || r.employee_id::INT::TEXT
      ELSE COALESCE(r.store, '') || '|' || COALESCE(r.name, '')
    END)::BIGINT AS employee_count,
    SUM(r.salary)::NUMERIC AS salary_amount,
    0::NUMERIC AS daily_wage_amount,
    SUM(r.other_comp)::NUMERIC AS other_comp_amount,
    SUM(r.salary + r.other_comp)::NUMERIC AS total_wage
  FROM paid_rows r
  GROUP BY r.month
),
monthly_excess AS (
  SELECT
    month,
    SUM(GREATEST(emp_total - 20000, 0))::NUMERIC AS excess_over_20000
  FROM emp_month_totals
  GROUP BY month
),
pnd1a_rows AS (
  SELECT
    left(COALESCE(w.tax_month, ''), 7) AS month,
    COALESCE(w.gross_amount, 0)::NUMERIC AS gross_amount
  FROM public.withholding_tax_ledger_entries w
  WHERE
    left(COALESCE(w.tax_month, ''), 4)::INT = p_year
    AND (
      COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*')
      OR COALESCE(w.store_name, '') = trim(p_store)
    )
    AND (
      lower(replace(COALESCE(w.form_hint, ''), ' ', '')) LIKE '%pnd1a%'
      OR lower(COALESCE(w.form_hint, '')) LIKE '%1ก%'
      OR COALESCE(w.form_hint, '') LIKE '%ภ.ง.ด.1ก%'
    )
),
pnd1a_monthly AS (
  SELECT month, SUM(gross_amount)::NUMERIC AS pnd1a_ledger_gross
  FROM pnd1a_rows
  GROUP BY month
)
SELECT
  m.month,
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

CREATE OR REPLACE FUNCTION public.get_kt20k_employee_diff_top(
  p_year INTEGER,
  p_store TEXT DEFAULT 'All',
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  employee_key TEXT,
  name TEXT,
  store TEXT,
  kt20k_total_wage NUMERIC,
  pnd1a_ledger_gross NUMERIC,
  diff NUMERIC,
  reason_tags JSONB
)
LANGUAGE sql
AS $$
WITH kt20k_emp AS (
  SELECT
    COALESCE(p.store, '') AS store,
    COALESCE(p.name, '') AS name,
    SUM(
      COALESCE(p.salary, 0) +
      COALESCE(p.pos_allow, 0) +
      COALESCE(p.haz_allow, 0) +
      COALESCE(p.diligence_allow, 0) +
      COALESCE(p.birth_bonus, 0) +
      COALESCE(p.spl_bonus, 0) +
      COALESCE(p.ot_amt, 0) +
      COALESCE(p.holiday_pay, 0)
    )::NUMERIC AS total_wage
  FROM public.payroll_records p
  WHERE
    left(COALESCE(p.month, ''), 4)::INT = p_year
    AND (
      COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*')
      OR COALESCE(p.store, '') = trim(p_store)
    )
    AND (
      lower(COALESCE(p.status, '')) IN ('paid', 'done', 'completed')
      OR lower(COALESCE(p.status, '')) LIKE '%paid%'
      OR COALESCE(p.status, '') LIKE '%ชำระ%'
    )
  GROUP BY COALESCE(p.store, ''), COALESCE(p.name, '')
),
pnd1a_emp AS (
  SELECT
    COALESCE(w.store_name, '') AS store,
    COALESCE(w.payee_name, '') AS name,
    SUM(COALESCE(w.gross_amount, 0))::NUMERIC AS total_gross
  FROM public.withholding_tax_ledger_entries w
  WHERE
    left(COALESCE(w.tax_month, ''), 4)::INT = p_year
    AND (
      COALESCE(NULLIF(trim(p_store), ''), 'All') IN ('All', '*')
      OR COALESCE(w.store_name, '') = trim(p_store)
    )
    AND (
      lower(replace(COALESCE(w.form_hint, ''), ' ', '')) LIKE '%pnd1a%'
      OR lower(COALESCE(w.form_hint, '')) LIKE '%1ก%'
      OR COALESCE(w.form_hint, '') LIKE '%ภ.ง.ด.1ก%'
    )
  GROUP BY COALESCE(w.store_name, ''), COALESCE(w.payee_name, '')
),
joined AS (
  SELECT
    COALESCE(k.store, p.store) AS store,
    COALESCE(k.name, p.name) AS name,
    COALESCE(k.total_wage, 0)::NUMERIC AS kt20k_total_wage,
    COALESCE(p.total_gross, 0)::NUMERIC AS pnd1a_ledger_gross
  FROM kt20k_emp k
  FULL OUTER JOIN pnd1a_emp p ON p.store = k.store AND p.name = k.name
),
tagged AS (
  SELECT
    (store || '|' || name) AS employee_key,
    name,
    store,
    ROUND(kt20k_total_wage, 2) AS kt20k_total_wage,
    ROUND(pnd1a_ledger_gross, 2) AS pnd1a_ledger_gross,
    ROUND(kt20k_total_wage - pnd1a_ledger_gross, 2) AS diff,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN kt20k_total_wage > 0 AND pnd1a_ledger_gross = 0 THEN 'missing_in_pnd1a' END,
      CASE WHEN kt20k_total_wage = 0 AND pnd1a_ledger_gross > 0 THEN 'missing_in_kt20k' END,
      CASE WHEN kt20k_total_wage > 0 AND pnd1a_ledger_gross > 0 AND ABS(kt20k_total_wage - pnd1a_ledger_gross) > 0.0001 THEN 'amount_mismatch' END
    ], NULL) AS tags
  FROM joined
)
SELECT
  employee_key,
  name,
  store,
  kt20k_total_wage,
  pnd1a_ledger_gross,
  diff,
  COALESCE(to_jsonb(tags), '[]'::JSONB) AS reason_tags
FROM tagged
WHERE ABS(diff) > 0.0001
ORDER BY ABS(diff) DESC
LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;
