-- 2/4 CM Huamak 과납 선수금 잔액 (원금 − CreditApply)
SELECT
  s.id,
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
    AND ref_id IN (3807, 3809)
  GROUP BY ref_id
) a ON a.ref_id = s.id
WHERE s.id IN (3807, 3809)
ORDER BY s.trans_date, s.id;
