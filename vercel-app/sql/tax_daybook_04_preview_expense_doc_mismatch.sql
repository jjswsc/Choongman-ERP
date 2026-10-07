-- 미리보기: 세무 분개 entry_no ≠ 지출 document_no (백필 대상)
SELECT
  je.id AS journal_id,
  je.entry_no,
  ea.document_no,
  je.source_type,
  je.source_id,
  je.accounting_date,
  je.tax_entity_code
FROM public.journal_entries je
JOIN public.expense_accruals ea ON ea.id = je.source_id
WHERE je.source_type = 'expense_accrual'
  AND je.book = 'tax'
  AND je.accounting_date >= '2026-07-01'
  AND ea.document_no IS NOT NULL
  AND ea.document_no <> ''
  AND coalesce(je.entry_no, '') IS DISTINCT FROM ea.document_no
ORDER BY je.accounting_date, je.id
LIMIT 200;
