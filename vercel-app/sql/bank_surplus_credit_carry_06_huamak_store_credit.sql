-- B) CM Huamak StoreCredit 잔여 (UI 3274.2 후보)
SELECT
  s.id,
  s.store_name,
  s.trans_date,
  round(s.amount::numeric, 2) AS gross,
  round(coalesce(a.applied_amt, 0)::numeric, 2) AS applied_amt,
  round((s.amount - coalesce(a.applied_amt, 0))::numeric, 2) AS remaining,
  s.memo
FROM receivable_transactions s
LEFT JOIN (
  SELECT ref_id, sum(abs(amount)) AS applied_amt
  FROM receivable_transactions
  WHERE ref_type = 'CreditApply'
  GROUP BY ref_id
) a ON a.ref_id = s.id
WHERE s.ref_type = 'StoreCredit'
  AND s.amount > 0
  AND s.store_name ILIKE 'CM Huamak'
ORDER BY s.trans_date, s.id;
