-- Seacon 미수 잔액 구성 (ref_type별) — 수금(Receive) 과다 여부 확인

SELECT
  coalesce(nullif(trim(ref_type), ''), '(empty)') AS ref_type,
  round(sum(amount)::numeric, 2) AS sum_amount,
  count(*) AS txn_count
FROM public.receivable_transactions
WHERE store_name IN ('CM Seacon Srinakarin', 'Seacon Srinakarin')
GROUP BY 1
ORDER BY sum_amount DESC;
