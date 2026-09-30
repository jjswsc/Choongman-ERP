-- Sang Charoen (1014) 원천세 상계 5건이 들어갔는지 확인. 변경 없음.

SELECT
  pt.trans_date,
  pt.amount,
  pt.memo,
  pt.bank_transaction_id,
  bt.withholding_tax_amount,
  bt.withholding_tax_rate
FROM public.payable_transactions pt
LEFT JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
WHERE pt.vendor_code = '1014'
  AND pt.ref_type = 'Withholding'
ORDER BY pt.trans_date, pt.id;
