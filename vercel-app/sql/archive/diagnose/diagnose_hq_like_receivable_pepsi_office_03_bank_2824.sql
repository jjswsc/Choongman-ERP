-- 3/5 2026-07-10 전후 ฿2,824.80 통장 입금
-- SELECT만. 이것만 복사 → Run
SELECT
  b.id,
  b.trans_date,
  b.amount,
  b.memo,
  b.category,
  b.store_name,
  b.account_id
FROM public.bank_transactions b
WHERE b.trans_date >= DATE '2026-07-09'
  AND b.trans_date <= DATE '2026-07-11'
  AND ABS(b.amount) BETWEEN 2824 AND 2826
ORDER BY b.id
