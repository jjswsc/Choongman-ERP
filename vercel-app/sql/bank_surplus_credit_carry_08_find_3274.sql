-- D) CM Huamak 금액 3274.2 관련 행 (UI 표시값 추적)
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
WHERE store_name ILIKE 'CM Huamak'
  AND (
    round(abs(amount)::numeric, 2) = 3274.20
    OR round(abs(amount)::numeric, 2) = 3274.2
  )
ORDER BY trans_date, id;
