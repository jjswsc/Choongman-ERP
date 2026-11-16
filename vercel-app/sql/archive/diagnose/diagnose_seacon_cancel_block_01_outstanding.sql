-- CM Seacon Srinakarin 미수 잔액 (취소 차단: 수금 초과 여부)
-- 음수면 이미 수금 초과 → 출고 화면에서 주문 취소가 막힘

SELECT
  store_name,
  round(sum(amount)::numeric, 2) AS outstanding,
  count(*) AS txn_count
FROM public.receivable_transactions
WHERE store_name IN ('CM Seacon Srinakarin', 'Seacon Srinakarin')
GROUP BY store_name
ORDER BY store_name;
