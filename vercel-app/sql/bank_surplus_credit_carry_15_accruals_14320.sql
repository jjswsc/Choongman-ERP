-- L) #14320 연결 인보이스 원금·수금 합 (신용 상계 포함 여부)
SELECT
  a.id AS accrual_id,
  a.trans_date,
  a.ref_type,
  round(a.amount::numeric, 2) AS accrual_amt,
  a.memo AS accrual_memo,
  round(coalesce(sum(abs(r.amount)), 0)::numeric, 2) AS received_abs,
  round((a.amount - coalesce(sum(abs(r.amount)), 0))::numeric, 2) AS open_amt
FROM receivable_transactions a
LEFT JOIN receivable_transactions r
  ON r.ref_id = a.id
 AND r.ref_type = 'Receive'
WHERE a.id IN (3121, 3003, 3120)
GROUP BY a.id, a.trans_date, a.ref_type, a.amount, a.memo
ORDER BY a.id;
