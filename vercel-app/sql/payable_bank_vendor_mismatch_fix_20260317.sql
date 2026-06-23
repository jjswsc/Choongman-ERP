-- =============================================================================
-- 2026-03-17~18 통장·미지급 불일치 일괄 정리 (점검 결과 기반)
--
-- 확인된 문제:
--   B) 통장 1건당 Payment 2건 — bank 1504,1506,1507,1621,1622,1623
--   A) bank 1506·1507 — 통장 1006(Klever) vs 미지급 1002(Sunfood)
--   C) Sunfood 1002 — 21888·183960·27734.40 각 2건씩 (B와 동일 원인)
--
-- keeper 규칙: expense_accrual_id 연동 행 우선 → 실제로는 낮은 id(198·200…) 유지
-- 삭제 대상 id: 1224, 1225, 1226, 1228, 1229, 1230  (지급예정 미연동 중복)
-- 유지 대상 id: 198, 200, 201, 304, 305, 306
--
-- ⚠ Supabase SQL Editor에서 (1) 미리보기 → (2) 정리 → (3) 검증 순서로 실행
-- =============================================================================

-- ── (1) 삭제 대상 미리보기 ─────────────────────────────────────────────────
WITH target_banks AS (
  SELECT unnest(ARRAY[1504, 1506, 1507, 1621, 1622, 1623]::bigint[]) AS bank_id
),
ranked AS (
  SELECT
    pt.id,
    pt.bank_transaction_id,
    pt.vendor_code,
    pt.expense_accrual_id,
    abs(pt.amount) AS amount,
    ROW_NUMBER() OVER (
      PARTITION BY pt.bank_transaction_id
      ORDER BY
        (CASE WHEN pt.expense_accrual_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
        pt.id DESC
    ) AS rn
  FROM public.payable_transactions pt
  JOIN target_banks tb ON tb.bank_id = pt.bank_transaction_id
  WHERE pt.ref_type = 'Payment'
)
SELECT
  id AS payable_id_to_delete,
  bank_transaction_id,
  vendor_code,
  expense_accrual_id,
  amount
FROM ranked
WHERE rn > 1
ORDER BY bank_transaction_id, id;

-- ── (2) 중복 Payment 삭제 (keeper 1건만 유지) ─────────────────────────────
-- 미리보기 삭제 id가 {1224,1225,1226,1228,1229,1230} 인지 확인 후 실행
/*
WITH target_banks AS (
  SELECT unnest(ARRAY[1504, 1506, 1507, 1621, 1622, 1623]::bigint[]) AS bank_id
),
ranked AS (
  SELECT
    pt.id,
    ROW_NUMBER() OVER (
      PARTITION BY pt.bank_transaction_id
      ORDER BY
        (CASE WHEN pt.expense_accrual_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
        pt.id DESC
    ) AS rn
  FROM public.payable_transactions pt
  JOIN target_banks tb ON tb.bank_id = pt.bank_transaction_id
  WHERE pt.ref_type = 'Payment'
)
DELETE FROM public.payable_transactions pt
USING ranked r
WHERE pt.id = r.id AND r.rn > 1;
*/

-- ── (3) 통장 거래처 → 미지급·지급예정 동기화 (Klever 1006 등) ───────────────
/*
UPDATE public.payable_transactions pt
SET vendor_code = trim(bt.vendor_code)
FROM public.bank_transactions bt
WHERE pt.bank_transaction_id = bt.id
  AND pt.ref_type = 'Payment'
  AND bt.id IN (1504, 1506, 1507, 1621, 1622, 1623)
  AND trim(coalesce(bt.vendor_code, '')) <> ''
  AND lower(trim(coalesce(pt.vendor_code, ''))) <> lower(trim(bt.vendor_code));

UPDATE public.expense_accruals ea
SET
  payee_code = CASE
    WHEN ea.payee_code LIKE '%::wm::%' THEN
      trim(bt.vendor_code) || substring(ea.payee_code from position('::wm::' in ea.payee_code))
    ELSE trim(bt.vendor_code)
  END,
  payee_name = coalesce(
    (SELECT v.name FROM public.vendors v WHERE lower(trim(v.code)) = lower(trim(bt.vendor_code)) LIMIT 1),
    ea.payee_name
  )
FROM public.payable_transactions pt
JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
WHERE ea.id = pt.expense_accrual_id
  AND pt.ref_type = 'Payment'
  AND bt.id IN (1504, 1506, 1507, 1621, 1622, 1623)
  AND pt.expense_accrual_id IS NOT NULL
  AND trim(coalesce(bt.vendor_code, '')) <> '';
*/

-- ── (4) 정리 후 검증 (A·B·C 모두 0건이어야 함) ─────────────────────────────
/*
WITH params AS (
  SELECT DATE '2026-03-17' AS start_date, DATE '2026-03-18' AS end_date
),
vendor_mismatch AS (
  SELECT pt.id
  FROM public.bank_transactions bt
  JOIN public.payable_transactions pt ON pt.bank_transaction_id = bt.id
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw' AND pt.ref_type = 'Payment'
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
    AND lower(trim(coalesce(bt.vendor_code, ''))) <> lower(trim(coalesce(pt.vendor_code, '')))
),
bank_dupes AS (
  SELECT pt.bank_transaction_id
  FROM public.payable_transactions pt
  JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment' AND pt.bank_transaction_id IS NOT NULL
    AND left(trim(pt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  GROUP BY pt.bank_transaction_id
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM vendor_mismatch) AS a_vendor_mismatch_cnt,
  (SELECT COUNT(*) FROM bank_dupes) AS b_bank_dupes_cnt;
*/
