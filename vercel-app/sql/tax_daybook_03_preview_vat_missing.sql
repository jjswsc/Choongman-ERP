-- 영업 중 pos_orders UPDATE 없음. 조회만.
-- VAT가 있는데 분개에 매입세(1360)가 없는 지출 발생 건수.

SELECT count(*) AS accrual_with_vat_missing_1360
FROM public.expense_accruals ea
WHERE ea.expense_date >= '2026-07-01'
  AND coalesce(ea.vat_amount, 0) > 0
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.source_type = 'expense_accrual'
      AND je.source_id = ea.id
      AND je.accounting_date >= '2026-07-01'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.source_type = 'expense_accrual'
      AND je.source_id = ea.id
      AND jl.account_code = '1360'
      AND lower(jl.side) = 'debit'
  );
