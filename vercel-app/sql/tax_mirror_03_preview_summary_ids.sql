-- 영업 중 pos_orders UPDATE 없음. 미리보기만 (DELETE 아님).
-- 월 요약 세무 전표 id — 거래 복제 후 중복이면 이 목록을 보고 별도 삭제.
SELECT
  id,
  tax_entity_code,
  source_type,
  accounting_date,
  memo
FROM public.journal_entries
WHERE book = 'tax'
  AND source_type IN (
    'tax_sales_summary',
    'tax_purchase_summary',
    'tax_vat_summary',
    'tax_payroll'
  )
  AND accounting_date >= '2026-07-01'
ORDER BY tax_entity_code, source_type, id;
