-- =============================================================================
-- Polonext (1026) 통장↔미지급 불일치·중복 점검/정리
-- Supabase SQL Editor — 기간·vendor_code 확인 후 Run
-- ⚠ DELETE는 (1) 점검 결과 확인 → (2) keeper id 확인 후 실행
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-05-01' AS start_date,
    DATE '2026-06-30' AS end_date,
    '1026'::text AS polonext_code
),

vendor_mismatch AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS bank_amount,
    trim(bt.vendor_code) AS bank_vendor,
    pt.id AS payable_id,
    abs(COALESCE(pt.amount, 0))::numeric AS payable_amount,
    trim(pt.vendor_code) AS payable_vendor,
    left(coalesce(pt.memo, ''), 120) AS payable_memo
  FROM public.bank_transactions bt
  JOIN public.payable_transactions pt ON pt.bank_transaction_id = bt.id
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw'
    AND pt.ref_type = 'Payment'
    AND lower(trim(coalesce(bt.vendor_code, ''))) = lower(trim(p.polonext_code))
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
    AND lower(trim(coalesce(bt.vendor_code, ''))) <> lower(trim(coalesce(pt.vendor_code, '')))
),

bank_dupes AS (
  SELECT
    pt.bank_transaction_id AS bank_id,
    COUNT(*)::bigint AS payment_cnt,
    array_agg(pt.id ORDER BY pt.id) AS payable_ids,
    MIN(abs(COALESCE(pt.amount, 0)))::numeric AS amount
  FROM public.payable_transactions pt
  JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
    AND lower(trim(coalesce(pt.vendor_code, ''))) = lower(trim(p.polonext_code))
    AND left(trim(pt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  GROUP BY pt.bank_transaction_id
  HAVING COUNT(*) > 1
),

amount_dupes AS (
  SELECT
    left(trim(pt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(pt.amount, 0))::numeric AS amount,
    COUNT(*)::bigint AS cnt,
    array_agg(pt.id ORDER BY pt.id) AS payable_ids,
    array_agg(pt.bank_transaction_id ORDER BY pt.id) AS bank_ids,
    array_agg(pt.expense_accrual_id ORDER BY pt.id) AS accrual_ids
  FROM public.payable_transactions pt
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND lower(trim(coalesce(pt.vendor_code, ''))) = lower(trim(p.polonext_code))
    AND left(trim(pt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
)

-- (1) 점검 요약
SELECT 0 AS sort_key, '【A 통장≠미지급 거래처】' AS label, COUNT(*)::bigint AS cnt, NULL::bigint AS ref_id, NULL::text AS detail
FROM vendor_mismatch
UNION ALL
SELECT 1, '【B 통장 1건 Payment 2건+】', COUNT(*)::bigint, NULL, NULL FROM bank_dupes
UNION ALL
SELECT 2, '【C 동일일자·금액 Payment 중복】', COUNT(*)::bigint, NULL, NULL FROM amount_dupes
UNION ALL
SELECT 10, 'mismatch bank ' || bank_id::text || ' payable ' || payable_id::text, NULL, payable_id,
  trans_date || ' bank=' || bank_amount::text || ' payable=' || payable_amount::text || ' | ' || payable_memo
FROM vendor_mismatch
UNION ALL
SELECT 11, 'bank dupe ' || bank_id::text, payment_cnt, NULL, 'ids=' || payable_ids::text || ' amt=' || amount::text
FROM bank_dupes
UNION ALL
SELECT 12, 'amount dupe ' || trans_date || ' ' || amount::text, cnt, NULL,
  'payable_ids=' || payable_ids::text || ' bank_ids=' || bank_ids::text
FROM amount_dupes
ORDER BY sort_key, label;

-- (2) 중복 삭제 예시 — keeper: expense_accrual_id 있음 + bank_transaction_id 있음 + 최대 id
-- SELECT pt.id, pt.bank_transaction_id, pt.expense_accrual_id, pt.amount, left(pt.memo, 80)
-- FROM payable_transactions pt
-- CROSS JOIN params p
-- WHERE pt.ref_type = 'Payment'
--   AND lower(trim(pt.vendor_code)) = lower(trim(p.polonext_code))
--   AND abs(pt.amount) IN (4108.8, 4793.6, 7190, 7190.4)
-- ORDER BY abs(pt.amount), pt.id;

-- DELETE FROM payable_transactions
-- WHERE id IN ( /* 점검 후 삭제할 id — keeper 제외 */ );

-- (3) 거래처 동기화 — 통장 vendor_code 기준으로 Payment·지급예정 payee 맞추기
-- UPDATE payable_transactions pt
-- SET vendor_code = bt.vendor_code
-- FROM bank_transactions bt
-- CROSS JOIN params p
-- WHERE pt.bank_transaction_id = bt.id
--   AND pt.ref_type = 'Payment'
--   AND lower(trim(bt.vendor_code)) = lower(trim(p.polonext_code))
--   AND lower(trim(coalesce(pt.vendor_code, ''))) <> lower(trim(bt.vendor_code));
