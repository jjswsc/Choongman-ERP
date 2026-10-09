-- C.A.P. Intertrade (1021) 2026-03-20 원천세 -530.05 만 확인. 변경 없음.

SELECT
  pt.id AS payable_id,
  pt.trans_date,
  pt.amount,
  pt.memo,
  pt.bank_transaction_id,
  bt.withholding_tax_amount,
  bt.withholding_tax_rate,
  bt.memo AS bank_memo
FROM public.payable_transactions pt
LEFT JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
WHERE pt.vendor_code = '1021'
  AND pt.ref_type = 'Withholding'
  AND pt.trans_date = '2026-03-20'
  AND pt.amount = -530.05;
