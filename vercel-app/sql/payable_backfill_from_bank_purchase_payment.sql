-- =============================================================================
-- 매입대금 통장 ↔ 미지급원장(payable_transactions) 일괄 백필
--
-- 대상 (지출검색에서 유형만 바꾸고 미지급에 안 잡힌 건 등):
--   · 통장 category = purchase_payment + 매입처 있는 출금 → Payment 행 없으면 생성
--   · 이미 있는 독립 Payment(지급예정 미연동) → 통장과 vendor·금액·일자·메모 동기화
--   · 통장당 Payment 2건 이상 → 지급예정 연동 우선, 없으면 최신 id 1건만 유지
--   · 통장이 expense 등(매입대금 아님)인데 독립 Payment만 남은 건 → 삭제 (원장 이중 방지)
--
-- Supabase SQL Editor: 전체 복사 → Run (BEGIN/COMMIT 포함, 재실행 안전)
-- =============================================================================

BEGIN;

-- ── (0) 실행 전 요약 ───────────────────────────────────────────────────────
SELECT '【0-A】매입대금 통장인데 Payment 없음' AS step,
       COUNT(*)::bigint AS cnt,
       ROUND(COALESCE(SUM(abs(bt.amount)), 0)::numeric, 2) AS amount_sum
FROM public.bank_transactions bt
WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) <> ''
  AND abs(coalesce(bt.amount, 0)) > 0.009
  AND NOT EXISTS (
    SELECT 1 FROM public.payable_transactions pt
    WHERE pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment'
  )

UNION ALL

SELECT '【0-B】통장≠매입대금인 독립 Payment(삭제 예정)',
       COUNT(*)::bigint,
       ROUND(COALESCE(SUM(abs(pt.amount)), 0)::numeric, 2)
FROM public.payable_transactions pt
JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
WHERE pt.ref_type = 'Payment'
  AND pt.expense_accrual_id IS NULL
  AND lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) <> 'purchase_payment'

UNION ALL

SELECT '【0-C】통장당 Payment 중복(정리 예정)',
       COUNT(*)::bigint,
       NULL::numeric
FROM (
  SELECT pt.bank_transaction_id
  FROM public.payable_transactions pt
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
  GROUP BY pt.bank_transaction_id
  HAVING COUNT(*) > 1
) d

UNION ALL

SELECT '【0-D】매입대금인데 Payment와 불일치(동기화 예정)',
       COUNT(*)::bigint,
       NULL::numeric
FROM public.payable_transactions pt
JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
WHERE pt.ref_type = 'Payment'
  AND pt.expense_accrual_id IS NULL
  AND lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) <> ''
  AND (
    trim(coalesce(pt.vendor_code, '')) IS DISTINCT FROM trim(bt.vendor_code)
    OR round(abs(coalesce(pt.amount, 0))::numeric, 2) IS DISTINCT FROM round(abs(coalesce(bt.amount, 0))::numeric, 2)
    OR left(trim(coalesce(pt.trans_date::text, '')), 10) IS DISTINCT FROM left(trim(coalesce(bt.trans_date::text, '')), 10)
  );

-- ── (1) 통장당 Payment 중복 제거 (keeper: 지급예정 연동 > 최신 id) ─────────
WITH ranked AS (
  SELECT
    pt.id,
    ROW_NUMBER() OVER (
      PARTITION BY pt.bank_transaction_id
      ORDER BY
        (CASE WHEN pt.expense_accrual_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
        pt.id DESC
    ) AS rn
  FROM public.payable_transactions pt
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
),
deleted_dup AS (
  DELETE FROM public.payable_transactions pt
  USING ranked r
  WHERE pt.id = r.id AND r.rn > 1
  RETURNING pt.id
)
SELECT '【1】중복 Payment 삭제' AS step, COUNT(*)::bigint AS cnt FROM deleted_dup;

-- ── (2) 매입대금이 아닌 통장에 매달린 독립 Payment 제거 ───────────────────
WITH deleted_orphan AS (
  DELETE FROM public.payable_transactions pt
  USING public.bank_transactions bt
  WHERE pt.bank_transaction_id = bt.id
    AND pt.ref_type = 'Payment'
    AND pt.expense_accrual_id IS NULL
    AND lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) <> 'purchase_payment'
  RETURNING pt.id
)
SELECT '【2】비매입대금 통장 독립 Payment 삭제' AS step, COUNT(*)::bigint AS cnt FROM deleted_orphan;

-- ── (3) 누락 Payment 생성 ───────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO public.payable_transactions (
    vendor_code,
    amount,
    ref_type,
    ref_id,
    trans_date,
    memo,
    bank_transaction_id
  )
  SELECT
    trim(bt.vendor_code),
    -round(abs(coalesce(bt.amount, 0))::numeric, 2),
    'Payment',
    NULL,
    left(trim(bt.trans_date::text), 10),
    CASE
      WHEN trim(coalesce(bt.memo, '')) <> '' THEN '통장 지급: ' || left(trim(bt.memo), 200)
      ELSE '통장 지급'
    END,
    bt.id
  FROM public.bank_transactions bt
  WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) = 'purchase_payment'
    AND trim(coalesce(bt.vendor_code, '')) <> ''
    AND abs(coalesce(bt.amount, 0)) > 0.009
    AND NOT EXISTS (
      SELECT 1 FROM public.payable_transactions pt
      WHERE pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment'
    )
  RETURNING id
)
SELECT '【3】누락 Payment 생성' AS step, COUNT(*)::bigint AS cnt FROM inserted;

-- ── (4) 기존 독립 Payment ↔ 통장 동기화 ───────────────────────────────────
WITH updated AS (
  UPDATE public.payable_transactions pt
  SET
    vendor_code = trim(bt.vendor_code),
    amount = -round(abs(coalesce(bt.amount, 0))::numeric, 2),
    trans_date = left(trim(bt.trans_date::text), 10),
    memo = CASE
      WHEN trim(coalesce(bt.memo, '')) <> '' THEN '통장 지급: ' || left(trim(bt.memo), 200)
      ELSE '통장 지급'
    END
  FROM public.bank_transactions bt
  WHERE pt.bank_transaction_id = bt.id
    AND pt.ref_type = 'Payment'
    AND pt.expense_accrual_id IS NULL
    AND lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) = 'purchase_payment'
    AND trim(coalesce(bt.vendor_code, '')) <> ''
    AND (
      trim(coalesce(pt.vendor_code, '')) IS DISTINCT FROM trim(bt.vendor_code)
      OR round(abs(coalesce(pt.amount, 0))::numeric, 2) IS DISTINCT FROM round(abs(coalesce(bt.amount, 0))::numeric, 2)
      OR left(trim(coalesce(pt.trans_date::text, '')), 10) IS DISTINCT FROM left(trim(coalesce(bt.trans_date::text, '')), 10)
      OR trim(coalesce(pt.memo, '')) IS DISTINCT FROM CASE
        WHEN trim(coalesce(bt.memo, '')) <> '' THEN '통장 지급: ' || left(trim(bt.memo), 200)
        ELSE '통장 지급'
      END
    )
  RETURNING pt.id
)
SELECT '【4】Payment 동기화' AS step, COUNT(*)::bigint AS cnt FROM updated;

-- ── (5) 실행 후 검증 (0이어야 함) ─────────────────────────────────────────
SELECT '【5-A】검증: 매입대금인데 Payment 없음' AS step,
       COUNT(*)::bigint AS cnt
FROM public.bank_transactions bt
WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) <> ''
  AND abs(coalesce(bt.amount, 0)) > 0.009
  AND NOT EXISTS (
    SELECT 1 FROM public.payable_transactions pt
    WHERE pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment'
  )

UNION ALL

SELECT '【5-B】검증: 통장당 Payment 중복',
       COUNT(*)::bigint
FROM (
  SELECT pt.bank_transaction_id
  FROM public.payable_transactions pt
  WHERE pt.ref_type = 'Payment' AND pt.bank_transaction_id IS NOT NULL
  GROUP BY pt.bank_transaction_id
  HAVING COUNT(*) > 1
) d;

-- ── (6) 매입처 없는 purchase_payment 통장 (수동 확인용, 자동 처리 안 함) ───
SELECT
  '【6】매입처 없음 — 수동 확인' AS step,
  bt.id AS bank_id,
  left(trim(bt.trans_date::text), 10) AS trans_date,
  round(abs(coalesce(bt.amount, 0))::numeric, 2) AS amount,
  trim(coalesce(bt.memo, '')) AS memo
FROM public.bank_transactions bt
WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) = ''
  AND abs(coalesce(bt.amount, 0)) > 0.009
ORDER BY bt.trans_date DESC, bt.id DESC
LIMIT 50;

COMMIT;
