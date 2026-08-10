-- 진단: 통장 출금 ↔ 지급예정 연결 후보가 비는 경우 (예: 2026-08-07 · ฿2,200)
-- 조회만. 값을 바꾼 뒤 Supabase SQL Editor에 붙여넣기.
-- ⚠ 영업 중 pos_orders 대량 UPDATE 금지와 무관(본 스크립트는 SELECT).

WITH params AS (
  SELECT
    NULL::bigint AS bank_id,          -- 알면 예: 10825 / 모르면 NULL
    '2026-08-07'::date AS bank_date, -- 통장 출금일
    2200::numeric AS bank_amount     -- 통장 출금 금액(절대값)
),
bank AS (
  SELECT
    b.id,
    b.trans_date::date AS trans_date,
    abs(b.amount::numeric) AS amount,
    b.memo,
    b.category,
    b.account_id
  FROM bank_transactions b
  CROSS JOIN params p
  WHERE p.bank_id IS NOT NULL
    AND b.id = p.bank_id
  UNION ALL
  SELECT
    NULL::bigint,
    p.bank_date,
    p.bank_amount,
    NULL::text,
    NULL::text,
    NULL::bigint
  FROM params p
  WHERE p.bank_id IS NULL
  LIMIT 1
),
already_linked AS (
  SELECT pt.id AS payable_id, pt.expense_accrual_id, pt.amount
  FROM payable_transactions pt
  JOIN bank b ON b.id IS NOT NULL AND pt.bank_transaction_id = b.id
  WHERE pt.expense_accrual_id IS NOT NULL
),
date_window AS (
  SELECT
    ea.id,
    ea.document_no,
    ea.status,
    ea.store_name,
    ea.payee_name,
    ea.amount,
    ea.withholding_tax_amount,
    ea.expense_date::date AS expense_date,
    ea.due_date::date AS due_date,
    (ea.amount::numeric - coalesce(ea.withholding_tax_amount, 0)::numeric) AS net_payable
  FROM expense_accruals ea
  CROSS JOIN bank b
  WHERE ea.status IN ('planned', 'approved', 'partial', 'paid', 'done')
    AND (
      (ea.expense_date::date BETWEEN b.trans_date - 14 AND b.trans_date + 14)
      OR (ea.due_date::date BETWEEN b.trans_date - 14 AND b.trans_date + 14)
    )
),
amount_match AS (
  SELECT
    ea.id,
    ea.document_no,
    ea.status,
    ea.store_name,
    ea.payee_name,
    ea.amount,
    ea.expense_date::date AS expense_date,
    ea.due_date::date AS due_date
  FROM expense_accruals ea
  CROSS JOIN bank b
  WHERE ea.status IN ('planned', 'approved', 'partial', 'paid', 'done')
    AND abs(ea.amount::numeric - b.amount) <= 0.02
  ORDER BY ea.id DESC
  LIMIT 50
),
settled AS (
  SELECT
    pt.expense_accrual_id,
    sum(abs(pt.amount::numeric)) AS settled_abs
  FROM payable_transactions pt
  WHERE pt.expense_accrual_id IN (SELECT id FROM date_window UNION SELECT id FROM amount_match)
    AND pt.amount < 0
    AND (coalesce(pt.bank_transaction_id, 0) > 0 OR coalesce(pt.petty_cash_transaction_id, 0) > 0)
  GROUP BY pt.expense_accrual_id
)
SELECT 1 AS step, 'bank_row' AS kind, to_jsonb(b.*) AS payload FROM bank b
UNION ALL
SELECT 2, 'already_linked', to_jsonb(a.*) FROM already_linked a
UNION ALL
SELECT 3, 'date_window_with_remaining', jsonb_build_object(
  'id', d.id,
  'document_no', d.document_no,
  'status', d.status,
  'store_name', d.store_name,
  'payee_name', d.payee_name,
  'net_payable', d.net_payable,
  'settled_abs', coalesce(s.settled_abs, 0),
  'remaining', d.net_payable - coalesce(s.settled_abs, 0),
  'expense_date', d.expense_date,
  'due_date', d.due_date
)
FROM date_window d
LEFT JOIN settled s ON s.expense_accrual_id = d.id
WHERE (d.net_payable - coalesce(s.settled_abs, 0)) > 0.009
UNION ALL
SELECT 4, 'amount_match_sample', to_jsonb(m.*) FROM amount_match m
ORDER BY 1, 2;
