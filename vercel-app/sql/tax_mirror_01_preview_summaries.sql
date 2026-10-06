-- 영업 중 pos_orders UPDATE 없음. journal_entries 조회만.
-- 월 요약 세무 전표(검색 자동전기분) 건수 — 거래별 분개와 겹치면 삭제 후보.
SELECT
  tax_entity_code,
  source_type,
  date_trunc('month', accounting_date::date)::date AS month_start,
  count(*) AS n
FROM public.journal_entries
WHERE book = 'tax'
  AND source_type IN (
    'tax_sales_summary',
    'tax_purchase_summary',
    'tax_vat_summary',
    'tax_payroll'
  )
  AND accounting_date >= '2026-07-01'
GROUP BY 1, 2, 3
ORDER BY 1, 3, 2;
