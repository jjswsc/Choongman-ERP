-- 2b/4 CreditApply 사용 내역 (3807, 3809에 연결된 상계)
SELECT
  id,
  store_name,
  trans_date,
  amount,
  ref_id,
  memo,
  bank_transaction_id
FROM receivable_transactions
WHERE ref_type = 'CreditApply'
  AND ref_id IN (3807, 3809)
ORDER BY trans_date, id;
