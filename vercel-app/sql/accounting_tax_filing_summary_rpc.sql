-- 태국 세무 신고 요약 집계 RPC (VAT/WHT)
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
  WHERE
    COALESCE(NULLIF(trim(p_store_name), ''), 'All') IN ('All', '*')
    OR v.store_name = trim(p_store_name)
),
vat_agg AS (
  SELECT
    COALESCE(SUM(CASE WHEN lower(direction) = 'output' THEN net_amount ELSE 0 END), 0) AS output_net,
    COALESCE(SUM(CASE WHEN lower(direction) = 'output' THEN vat_amount ELSE 0 END), 0) AS output_vat,
    COALESCE(SUM(CASE WHEN lower(direction) = 'input' THEN net_amount ELSE 0 END), 0) AS input_net,
    COALESCE(SUM(CASE WHEN lower(direction) = 'input' THEN vat_amount ELSE 0 END), 0) AS input_vat,
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
  WHERE
    COALESCE(NULLIF(trim(p_store_name), ''), 'All') IN ('All', '*')
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
    jsonb_object_agg(
      form_hint,
      jsonb_build_object('gross', gross, 'withheld', withheld, 'rows', rows)
    ),
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
