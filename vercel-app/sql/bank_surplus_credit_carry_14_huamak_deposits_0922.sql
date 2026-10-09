-- K) 같은 날 CM Huamak 입금 목록 (14320 vs 14321)
SELECT
  id,
  store_name,
  store,
  trans_date,
  round(amount::numeric, 2) AS amount,
  category,
  left(memo, 80) AS memo
FROM bank_transactions
WHERE trans_date = '2026-09-22'
  AND (
    store_name ILIKE 'CM Huamak'
    OR id IN (14320, 14321)
  )
  AND lower(coalesce(category, '')) = 'receivable_receive'
ORDER BY id;
