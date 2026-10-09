-- 1/4 과납 선수금 원본 확인 (9/16 ฿1,819 · 9/17 ฿4,609.37)
-- 매장명은 결과 store_name 을 다음 쿼리에 그대로 넣으세요.
SELECT
  id,
  store_name,
  trans_date,
  abs(amount) AS surplus_amt,
  memo,
  bank_transaction_id
FROM receivable_transactions
WHERE ref_type = 'Receive'
  AND ref_id IS NULL
  AND amount < 0
  AND memo LIKE '과납 선수금%'
  AND (
    round(abs(amount)::numeric, 2) = 1819.00
    OR round(abs(amount)::numeric, 2) = 4609.37
  )
ORDER BY trans_date, id;
