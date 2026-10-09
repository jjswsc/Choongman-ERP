-- 3/4 CM Huamak 가용 선수금 합계 (과납 + StoreCredit) — UI「ยอดเครดิตลูกค้า」와 비교
WITH surplus AS (
  SELECT id, abs(amount) AS gross
  FROM receivable_transactions
  WHERE ref_type = 'Receive'
    AND ref_id IS NULL
    AND amount < 0
    AND memo LIKE '과납 선수금%'
    AND bank_transaction_id IS NOT NULL
    AND store_name ILIKE 'CM Huamak'
),
surplus_applied AS (
  SELECT ref_id, sum(abs(amount)) AS applied_amt
  FROM receivable_transactions
  WHERE ref_type = 'CreditApply'
    AND ref_id IN (SELECT id FROM surplus)
  GROUP BY ref_id
),
store_credit AS (
  SELECT id, amount AS gross
  FROM receivable_transactions
  WHERE ref_type = 'StoreCredit'
    AND amount > 0
    AND store_name ILIKE 'CM Huamak'
),
credit_applied AS (
  SELECT ref_id, sum(abs(amount)) AS applied_amt
  FROM receivable_transactions
  WHERE ref_type = 'CreditApply'
    AND ref_id IN (SELECT id FROM store_credit)
  GROUP BY ref_id
)
SELECT
  round(coalesce((
    SELECT sum(s.gross - coalesce(a.applied_amt, 0))
    FROM surplus s
    LEFT JOIN surplus_applied a ON a.ref_id = s.id
    WHERE s.gross - coalesce(a.applied_amt, 0) > 0.009
  ), 0)::numeric, 2) AS surplus_remaining,
  round(coalesce((
    SELECT sum(c.gross - coalesce(a.applied_amt, 0))
    FROM store_credit c
    LEFT JOIN credit_applied a ON a.ref_id = c.id
    WHERE c.gross - coalesce(a.applied_amt, 0) > 0.009
  ), 0)::numeric, 2) AS store_credit_remaining,
  round((
    coalesce((
      SELECT sum(s.gross - coalesce(a.applied_amt, 0))
      FROM surplus s
      LEFT JOIN surplus_applied a ON a.ref_id = s.id
      WHERE s.gross - coalesce(a.applied_amt, 0) > 0.009
    ), 0)
    +
    coalesce((
      SELECT sum(c.gross - coalesce(a.applied_amt, 0))
      FROM store_credit c
      LEFT JOIN credit_applied a ON a.ref_id = c.id
      WHERE c.gross - coalesce(a.applied_amt, 0) > 0.009
    ), 0)
  )::numeric, 2) AS store_credit_available;
