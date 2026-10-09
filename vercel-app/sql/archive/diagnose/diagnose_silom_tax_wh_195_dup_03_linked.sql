-- 3/6 안전 확인: 실통장·패티 연결·지급(음수)이 있으면 삭제 중단 (0행이어야 함)

SELECT
  pt.id,
  pt.expense_accrual_id,
  pt.ref_type,
  pt.amount,
  pt.bank_transaction_id,
  pt.petty_cash_transaction_id
FROM public.payable_transactions pt
WHERE pt.expense_accrual_id IN (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
    AND lower(coalesce(ea.status, '')) = 'planned'
)
  AND (
    coalesce(pt.bank_transaction_id, 0) > 0
    OR coalesce(pt.petty_cash_transaction_id, 0) > 0
    OR pt.amount < 0
  )
ORDER BY pt.id;
