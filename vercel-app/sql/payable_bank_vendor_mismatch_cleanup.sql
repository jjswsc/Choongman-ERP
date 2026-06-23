-- =============================================================================
-- 통장(bank_transactions) vs 미지급 Payment(payable_transactions) 거래처 불일치·중복 점검/정리
-- Supabase SQL Editor — start_date / end_date / vendor_code 수정 후 Run
-- ⚠ DELETE 구문은 점검 결과 확인 후 필요한 블록만 실행하세요.
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-03-17' AS start_date,
    DATE '2026-03-18' AS end_date,
    '1002'::text AS sunfood_code,   -- Sun Food vendor code
    NULL::text AS klever_code       -- Klever vendor code (있으면 입력)
),

-- (A) 통장 vendor ≠ 미지급 vendor (통장만 수정된 건)
vendor_mismatch AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount,
    trim(bt.vendor_code) AS bank_vendor,
    pt.id AS payable_id,
    trim(pt.vendor_code) AS payable_vendor,
    left(coalesce(pt.memo, ''), 120) AS payable_memo
  FROM public.bank_transactions bt
  JOIN public.payable_transactions pt ON pt.bank_transaction_id = bt.id
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw'
    AND pt.ref_type = 'Payment'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND lower(trim(coalesce(bt.vendor_code, ''))) <> lower(trim(coalesce(pt.vendor_code, '')))
),

-- (B) 동일 통장 1건에 Payment 2건 이상
bank_dupes AS (
  SELECT
    pt.bank_transaction_id AS bank_id,
    COUNT(*)::bigint AS payment_cnt,
    array_agg(pt.id ORDER BY pt.id) AS payable_ids,
    array_agg(trim(pt.vendor_code) ORDER BY pt.id) AS vendors,
    MIN(left(trim(pt.trans_date::text), 10)) AS trans_date,
    MIN(abs(COALESCE(pt.amount, 0)))::numeric AS amount
  FROM public.payable_transactions pt
  JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
    AND left(trim(pt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(pt.trans_date::text), 10)::date <= p.end_date
  GROUP BY pt.bank_transaction_id
  HAVING COUNT(*) > 1
),

-- (C) 거래처·일자·금액 동일 Payment 중복 (통장 id 다를 수 있음 — CSV 3중 등록)
amount_dupes AS (
  SELECT
    lower(trim(pt.vendor_code)) AS vendor_code,
    left(trim(pt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(pt.amount, 0))::numeric AS amount,
    COUNT(*)::bigint AS cnt,
    array_agg(pt.id ORDER BY pt.id) AS payable_ids,
    array_agg(pt.bank_transaction_id ORDER BY pt.id) AS bank_ids
  FROM public.payable_transactions pt
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND left(trim(pt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(pt.trans_date::text), 10)::date <= p.end_date
    AND (
      p.sunfood_code IS NULL
      OR lower(trim(pt.vendor_code)) = lower(trim(p.sunfood_code))
    )
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1
)

SELECT 0 AS sort_key, '【A 통장≠미지급 거래처】' AS label, COUNT(*)::bigint AS cnt, NULL::bigint AS ref_id, NULL::text AS detail
FROM vendor_mismatch
UNION ALL
SELECT 1, 'bank ' || bank_id::text || ' payable ' || payable_id::text, NULL, payable_id,
  trans_date || ' | bank=' || bank_vendor || ' payable=' || payable_vendor || ' | ' || payable_memo
FROM vendor_mismatch
UNION ALL
SELECT 2, '【B 통장 1건 Payment N건】', COUNT(*)::bigint, NULL, NULL FROM bank_dupes
UNION ALL
SELECT 3, 'bank ' || bank_id::text || ' x' || payment_cnt::text, payment_cnt, bank_id,
  trans_date || ' | ' || amount::text || ' | payable_ids=' || payable_ids::text
FROM bank_dupes
UNION ALL
SELECT 4, '【C 거래처·일자·금액 중복】', COUNT(*)::bigint, NULL, NULL FROM amount_dupes
UNION ALL
SELECT 5, vendor_code || ' ' || trans_date || ' ' || amount::text, cnt, NULL,
  'payable_ids=' || payable_ids::text || ' bank_ids=' || bank_ids::text
FROM amount_dupes
ORDER BY sort_key, label;

-- =============================================================================
-- 정리 예시 (점검 후 주석 해제·id 수정)
-- =============================================================================

-- (1) Klever로 바꾼 통장에 맞춰 미지급·지급예정 거래처 동기화 (bank_id·klever_code 치환)
/*
UPDATE public.payable_transactions pt
SET vendor_code = 'KLEVER_CODE'
FROM public.bank_transactions bt
WHERE pt.bank_transaction_id = bt.id
  AND bt.id IN (12345, 12346)
  AND pt.ref_type = 'Payment';

UPDATE public.expense_accruals ea
SET
  payee_code = CASE
    WHEN ea.payee_code LIKE '%::wm::%' THEN 'KLEVER_CODE' || substring(ea.payee_code from position('::wm::' in ea.payee_code))
    ELSE 'KLEVER_CODE'
  END,
  payee_name = (SELECT name FROM public.vendors WHERE lower(trim(code)) = lower(trim('KLEVER_CODE')) LIMIT 1)
WHERE ea.id IN (
  SELECT DISTINCT expense_accrual_id FROM public.payable_transactions
  WHERE bank_transaction_id IN (12345, 12346) AND expense_accrual_id IS NOT NULL
);
*/

-- (2) 동일 bank_transaction_id 중복 Payment — keeper 1건만 남기고 삭제 (keeper_id·delete_ids 치환)
/*
DELETE FROM public.payable_transactions
WHERE id IN (111, 112)  -- 삭제할 id
  AND id <> 113;        -- keeper id
*/
