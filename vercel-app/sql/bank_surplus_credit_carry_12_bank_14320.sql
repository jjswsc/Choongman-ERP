-- I) 선수금이 쓰인 통장 #14320
SELECT
  id,
  store_name,
  store,
  trans_date,
  round(amount::numeric, 2) AS amount,
  category,
  memo
FROM bank_transactions
WHERE id = 14320;
