-- 진단: 통장 출금 ฿2,200 (2026-08-07) ↔ 지급예정 후보가 안 뜨는 경우
-- 조회만. Supabase SQL Editor에 붙여넣기.
-- ⚠ 영업 중 pos_orders 대량 UPDATE 금지와 무관(본 스크립트는 SELECT).

WITH params AS (
  SELECT
    NULL::bigint AS bank_id,          -- 알면 예: 10825 / 모르면 NULL
    '2026-08-07'::date AS bank_date,
    2200::numeric AS bank_amount,
    'CM Silom'::text AS store_hint    -- 통장 계좌 매장명 (다르면 수정)
),
bank AS (
  SELECT *
  FROM (
    SELECT
      b.id,
      b.trans_date::date AS trans_date,
      abs(b.amount::numeric) AS amount,
      b.memo,
      b.category,
      b.account_id,
      b.store_name
    FROM bank_transactions b
    CROSS JOIN params p
    WHERE p.bank_id IS NOT NULL
      AND b.id = p.bank_id
    UNION ALL
    SELECT
      b.id,
      b.trans_date::date,
      abs(b.amount::numeric),
      b.memo,
      b.category,
      b.account_id,
      b.store_name
    FROM bank_transactions b
    CROSS JOIN params p
    WHERE p.bank_id IS NULL
      AND b.trans_type = 'withdraw'
      AND b.trans_date::date = p.bank_date
      AND abs(b.amount::numeric - p.bank_amount) <= 0.02
  ) x
  ORDER BY id DESC NULLS LAST
  LIMIT 5
),
amount_hits AS (
  SELECT
    ea.id,
    ea.document_no,
    ea.status,
    ea.store_name,
    ea.payee_name,
    ea.payee_code,
    ea.amount::numeric AS gross,
    coalesce(ea.withholding_tax_amount, 0)::numeric AS wht,
    (ea.amount::numeric - coalesce(ea.withholding_tax_amount, 0)::numeric) AS net_payable,
    ea.expense_date::date AS expense_date,
    ea.due_date::date AS due_date,
    ea.memo
  FROM expense_accruals ea
  CROSS JOIN params p
  WHERE ea.status IN ('planned', 'approved', 'partial', 'paid', 'done')
    AND (
      abs(ea.amount::numeric - p.bank_amount) <= 0.02
      OR (
        ea.amount::numeric >= p.bank_amount
        AND ea.amount::numeric <= p.bank_amount / 0.85 + 0.02
      )
    )
  ORDER BY ea.id DESC
  LIMIT 100
),
settled AS (
  SELECT
    pt.expense_accrual_id,
    sum(abs(pt.amount::numeric)) AS settled_abs
  FROM payable_transactions pt
  LEFT JOIN bank_transactions bt ON bt.id = pt.bank_transaction_id
  WHERE pt.expense_accrual_id IN (SELECT id FROM amount_hits)
    AND pt.amount < 0
    AND (
      coalesce(pt.petty_cash_transaction_id, 0) > 0
      OR (
        coalesce(pt.bank_transaction_id, 0) > 0
        AND coalesce(bt.note, '') NOT ILIKE '%source:expense_internal%'
      )
    )
  GROUP BY pt.expense_accrual_id
),
with_remaining AS (
  SELECT
    a.*,
    coalesce(s.settled_abs, 0) AS settled_abs,
    a.net_payable - coalesce(s.settled_abs, 0) AS remaining
  FROM amount_hits a
  LEFT JOIN settled s ON s.expense_accrual_id = a.id
)
SELECT 1 AS step, 'bank_rows' AS kind, to_jsonb(b.*) AS payload FROM bank b
UNION ALL
SELECT 2, 'amount_hit_linkable', jsonb_build_object(
  'id', w.id,
  'document_no', w.document_no,
  'status', w.status,
  'store_name', w.store_name,
  'payee_name', w.payee_name,
  'payee_code', w.payee_code,
  'gross', w.gross,
  'net_payable', w.net_payable,
  'remaining', w.remaining,
  'expense_date', w.expense_date,
  'due_date', w.due_date,
  'memo', w.memo,
  'store_ok', (
    w.store_name ILIKE '%' || (SELECT store_hint FROM params) || '%'
  )
)
FROM with_remaining w
WHERE w.remaining > 0.009
UNION ALL
SELECT 3, 'amount_hit_but_zero_remaining', jsonb_build_object(
  'id', w.id,
  'status', w.status,
  'store_name', w.store_name,
  'payee_name', w.payee_name,
  'gross', w.gross,
  'remaining', w.remaining,
  'settled_abs', w.settled_abs
)
FROM with_remaining w
WHERE w.remaining <= 0.009
UNION ALL
SELECT 4, 'no_amount_hit_means_no_accrual', jsonb_build_object(
  'hint', 'step2·3이 비면 ฿2,200 지급예정이 없거나 금액이 다름 → 지출관리에서 신규 등록 필요'
)
WHERE NOT EXISTS (SELECT 1 FROM amount_hits)
ORDER BY 1, 2;
