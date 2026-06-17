-- =============================================================================
-- 통장 매입대금(purchase_payment) 미지급원장 미연동 점검
-- category=purchase_payment 출금 + vendor_code 있는데 payable Payment 행 없음
-- Supabase SQL Editor에 통째로 붙여넣기 → start_date / end_date / vendor_code 수정 후 Run
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-04-01' AS start_date,  -- ← 조회 시작
    DATE '2026-12-31' AS end_date,    -- ← 조회 종료
    NULL::text AS vendor_code         -- ← 예: '1006' (Klever). NULL이면 전체
),
pay_bank AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount,
    trim(bt.vendor_code) AS vendor_code,
    trim(COALESCE(v.name, bt.vendor_code, '')) AS vendor_name,
    bt.memo
  FROM public.bank_transactions bt
  CROSS JOIN params p
  LEFT JOIN public.vendors v ON lower(trim(v.code)) = lower(trim(bt.vendor_code))
  WHERE bt.trans_type = 'withdraw'
    AND bt.category = 'purchase_payment'
    AND trim(COALESCE(bt.vendor_code, '')) <> ''
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND (p.vendor_code IS NULL OR lower(trim(bt.vendor_code)) = lower(trim(p.vendor_code)))
),
gaps AS (
  SELECT pb.*
  FROM pay_bank pb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payable_transactions pt
    WHERE pt.bank_transaction_id = pb.bank_id
      AND pt.ref_type = 'Payment'
  )
),
accrual_pay_gaps AS (
  -- 지급예정(매입대금)으로 지급됐는데 원장에 안 잡히던 건 — expense_accrual_id 있는 Payment
  SELECT
    pt.id AS payable_id,
    left(trim(pt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(pt.amount, 0))::numeric AS amount,
    trim(pt.vendor_code) AS vendor_code,
    pt.expense_accrual_id,
    pt.bank_transaction_id,
    pt.memo,
    trim(ea.payee_code) AS payee_code
  FROM public.payable_transactions pt
  JOIN public.expense_accruals ea ON ea.id = pt.expense_accrual_id
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.expense_accrual_id IS NOT NULL
    AND ea.payee_code ILIKE '%::wm::purchase_%'
    AND left(trim(pt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(pt.trans_date::text), 10)::date <= p.end_date
    AND (p.vendor_code IS NULL OR lower(trim(pt.vendor_code)) = lower(trim(p.vendor_code)))
)

SELECT
  0 AS sort_key,
  '【통장 매입대금 gap】' AS label,
  COUNT(*)::bigint AS cnt,
  ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS amount_sum,
  NULL::bigint AS ref_id,
  NULL::text AS trans_date,
  NULL::text AS detail
FROM gaps

UNION ALL

SELECT
  1,
  coalesce(vendor_name, vendor_code, '?'),
  NULL,
  amount,
  bank_id,
  trans_date,
  left(coalesce(memo, ''), 100)
FROM gaps

UNION ALL

SELECT
  2,
  '【지급예정 매입지급(원장 반영 대상)】',
  COUNT(*)::bigint,
  ROUND(COALESCE(SUM(amount), 0)::numeric, 2),
  NULL,
  NULL,
  NULL
FROM accrual_pay_gaps

UNION ALL

SELECT
  3,
  coalesce(vendor_code, '?'),
  NULL,
  amount,
  payable_id,
  trans_date,
  left(coalesce(memo, payee_code, ''), 100)
FROM accrual_pay_gaps

ORDER BY sort_key, amount_sum DESC NULLS LAST, trans_date DESC NULLS LAST;
