-- 4/6 미리보기: 잘못된 손익 분개(있으면). 원천세 납부는 비용분개가 아니어야 함.

SELECT
  je.id AS journal_entry_id,
  je.source_type,
  je.source_id,
  je.accounting_date,
  je.memo,
  je.store_name
FROM public.journal_entries je
WHERE je.source_type = 'expense_accrual'
  AND je.source_id IN (
    SELECT ea.id
    FROM public.expense_accruals ea
    WHERE ea.store_name ILIKE '%Silom%'
      AND ea.expense_date = DATE '2026-08-17'
      AND abs(ea.amount::numeric - 195) < 0.02
      AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
  )
ORDER BY je.source_id, je.id;
