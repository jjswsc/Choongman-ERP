-- 6/6 검증: Silom 2026-08-17 ฿195 원천세 planned 가 0건이어야 함

SELECT
  ea.id,
  ea.status,
  ea.document_no,
  ea.amount,
  ea.payee_name
FROM public.expense_accruals ea
WHERE ea.store_name ILIKE '%Silom%'
  AND ea.expense_date = DATE '2026-08-17'
  AND abs(ea.amount::numeric - 195) < 0.02
  AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
ORDER BY ea.id;
