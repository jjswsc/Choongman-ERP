-- M) 해당 인보이스 선수금 상계 Receive (bank_transaction_id null)
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
WHERE ref_type = 'Receive'
  AND ref_id IN (3121, 3003, 3120)
  AND (
    memo ILIKE '%선수금%'
    OR bank_transaction_id IS NULL
    OR bank_transaction_id = 14320
  )
ORDER BY ref_id, id;
