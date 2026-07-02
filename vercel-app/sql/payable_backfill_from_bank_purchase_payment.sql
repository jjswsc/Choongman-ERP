-- 통장 매입대금(purchase_payment) + 거래처 지정 건 중 payable_transactions Payment 가 없는 건 백필
-- (CSV 일괄 등록·addBankTransaction 경로에서 미지급 동기화가 빠졌던 2026-07 이전 데이터 보정용)
--
-- ⚠ Supabase SQL Editor: (1) 미리보기 → (2) INSERT 실행 → (3) 검증

-- (1) 백필 대상 미리보기
SELECT
  bt.id AS bank_transaction_id,
  left(trim(bt.trans_date::text), 10) AS trans_date,
  trim(bt.vendor_code) AS vendor_code,
  abs(bt.amount) AS amount_abs,
  left(coalesce(bt.memo, ''), 80) AS memo
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
ORDER BY bt.trans_date, bt.id;

-- (2) Payment 행 생성 (미리보기 건수와 일치 확인 후 실행)
/*
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
  );
*/

-- (3) 검증 — 0건이어야 함
/*
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
*/
