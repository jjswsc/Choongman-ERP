-- A) 전체「과납 선수금」3건 + 잔여
SELECT
  s.id,
  s.store_name,
  s.trans_date,
  round(abs(s.amount)::numeric, 2) AS gross,
  round(coalesce(a.applied_amt, 0)::numeric, 2) AS applied_amt,
  round((abs(s.amount) - coalesce(a.applied_amt, 0))::numeric, 2) AS remaining,
  s.memo,
  s.bank_transaction_id
FROM receivable_transactions s
LEFT JOIN (
  SELECT ref_id, sum(abs(amount)) AS applied_amt
  FROM receivable_transactions
  WHERE ref_type = 'CreditApply'
  GROUP BY ref_id
) a ON a.ref_id = s.id
WHERE s.ref_type = 'Receive'
  AND s.ref_id IS NULL
  AND s.amount < 0
  AND s.memo LIKE '과납 선수금%'
ORDER BY s.trans_date, s.id;
