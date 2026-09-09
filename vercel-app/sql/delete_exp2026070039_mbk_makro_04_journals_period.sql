-- 4/4 미리보기: 발생 #2316 · 통장 #10403 자동분개
-- 조회만. 삭제 금지.

SELECT
  je.id AS journal_entry_id,
  je.source_type,
  je.source_id,
  je.accounting_date,
  je.store_name,
  je.memo
FROM public.journal_entries je
WHERE (je.source_type = 'expense_accrual' AND je.source_id = 2316)
   OR (je.source_type = 'bank_transaction' AND je.source_id = 10403)
ORDER BY je.source_type, je.id;
