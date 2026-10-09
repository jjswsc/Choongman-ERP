-- F) 3807·3809 CreditApply 사용 내역 (어느 입금에 상계됐는지)
SELECT
  id,
  store_name,
  trans_date,
  round(amount::numeric, 2) AS amount,
  ref_type,
  ref_id,
  memo,
  bank_transaction_id
FROM receivable_transactions
WHERE ref_type = 'CreditApply'
  AND ref_id IN (3807, 3809)
ORDER BY trans_date, id;
