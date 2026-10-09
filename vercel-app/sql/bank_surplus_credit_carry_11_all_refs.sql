-- H) 3807·3809를 참조하는 모든 행 (CreditApply 외 경로 포함)
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
WHERE id IN (3807, 3809)
   OR ref_id IN (3807, 3809)
ORDER BY coalesce(ref_id, id), id;
