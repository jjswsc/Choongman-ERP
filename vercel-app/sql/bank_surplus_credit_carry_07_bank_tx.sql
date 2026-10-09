-- G) 9/22 입금 ฿49,703.83 통장 행 (컬럼 최소화)
SELECT
  id,
  store_name,
  store,
  trans_date,
  amount,
  category,
  memo
FROM bank_transactions
WHERE trans_date = '2026-09-22'
  AND round(abs(amount)::numeric, 2) = 49703.83
ORDER BY id;
