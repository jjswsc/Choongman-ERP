-- 2/6 미리보기: 위 지급예정의 payable 행
-- 23502 실패분이면 payable 0행일 수 있음. 조회만.

SELECT
  pt.id,
  pt.expense_accrual_id,
  pt.ref_type,
  pt.amount,
  pt.vendor_code,
  pt.bank_transaction_id,
  pt.petty_cash_transaction_id,
  pt.memo,
  pt.trans_date
FROM public.payable_transactions pt
WHERE pt.expense_accrual_id IN (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
)
ORDER BY pt.expense_accrual_id, pt.id;
