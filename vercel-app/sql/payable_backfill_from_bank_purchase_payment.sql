-- =============================================================================
-- 통장 매입대금(purchase_payment) + 거래처 → payable_transactions Payment 백필
-- Supabase SQL Editor: 아래 전체를 복사해 한 번에 실행
-- (이미 Payment가 있는 통장 건은 NOT EXISTS 로 건너뜀 — 재실행 안전)
-- =============================================================================

BEGIN;

-- (1) 백필 대상 건수 (실행 전 확인)
SELECT COUNT(*) AS backfill_target_cnt
FROM public.bank_transactions bt
WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) <> ''
  AND abs(coalesce(bt.amount, 0)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.payable_transactions pt
    WHERE pt.bank_transaction_id = bt.id
      AND pt.ref_type = 'Payment'
  );

-- (2) Payment 행 생성
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
    -abs(bt.amount),
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
    AND abs(coalesce(bt.amount, 0)) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.payable_transactions pt
      WHERE pt.bank_transaction_id = bt.id
        AND pt.ref_type = 'Payment'
    )
  RETURNING id, bank_transaction_id, vendor_code, amount, trans_date
)
SELECT COUNT(*) AS inserted_cnt FROM inserted;

-- (3) 검증 — 0이어야 함
SELECT COUNT(*) AS missing_payable_cnt
FROM public.bank_transactions bt
WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) <> ''
  AND abs(coalesce(bt.amount, 0)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.payable_transactions pt
    WHERE pt.bank_transaction_id = bt.id
      AND pt.ref_type = 'Payment'
  );

COMMIT;
