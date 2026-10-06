-- 영업 중 pos_orders UPDATE 없음. 조회만.
-- 04 삭제 후 월 요약이 0건이어야 함.

SELECT count(*) AS leftover_summaries
FROM public.journal_entries
WHERE book = 'tax'
  AND source_type IN (
    'tax_sales_summary',
    'tax_purchase_summary',
    'tax_vat_summary',
    'tax_payroll'
  )
  AND accounting_date >= '2026-07-01';
