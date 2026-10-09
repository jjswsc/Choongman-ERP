-- J) 통장 #14320에 연결된 미수 Receive / 상계 행
SELECT
  id,
  store_name,
  trans_date,
  ref_type,
  ref_id,
  round(amount::numeric, 2) AS amount,
  memo,
  bank_transaction_id
FROM receivable_transactions
WHERE bank_transaction_id = 14320
   OR (ref_type = 'CreditApply' AND bank_transaction_id = 14320)
ORDER BY id;
