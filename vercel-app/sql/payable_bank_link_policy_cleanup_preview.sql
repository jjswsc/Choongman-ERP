-- =============================================================================
-- 미지급 통장 연동 Payment 정리 (미리보기) — 지출관리 연동 + 은행 적요 우선
--
-- 실행은 스크립트 권장:
--   node scripts/apply-payable-bank-link-cleanup.mjs --dry-run
--   node scripts/apply-payable-bank-link-cleanup.mjs --execute
--
-- 아래는 Supabase SQL Editor에서 건수만 확인용
-- =============================================================================

-- (A) 동일 통장에 Payment 2건+
SELECT
  pt.bank_transaction_id,
  COUNT(*)::int AS payment_cnt,
  COUNT(*) FILTER (WHERE pt.expense_accrual_id IS NOT NULL)::int AS with_accrual,
  COUNT(*) FILTER (WHERE pt.expense_accrual_id IS NULL)::int AS orphan,
  ROUND(MAX(ABS(pt.amount))::numeric, 2) AS amount_abs,
  MAX(LEFT(TRIM(pt.trans_date::text), 10)) AS sample_date,
  MAX(pt.vendor_code) AS sample_vendor
FROM public.payable_transactions pt
WHERE pt.ref_type = 'Payment'
  AND pt.bank_transaction_id IS NOT NULL
GROUP BY pt.bank_transaction_id
HAVING COUNT(*) > 1
ORDER BY payment_cnt DESC, bank_transaction_id DESC
LIMIT 100;

-- (B) 지출 지급 문구인데 통장 memo가 다른 건 (적요 교체 후보)
SELECT
  pt.id AS payable_id,
  pt.bank_transaction_id,
  LEFT(TRIM(pt.trans_date::text), 10) AS trans_date,
  pt.vendor_code,
  LEFT(COALESCE(pt.memo, ''), 120) AS payable_memo,
  LEFT(COALESCE(bt.memo, ''), 120) AS bank_memo
FROM public.payable_transactions pt
JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
WHERE pt.ref_type = 'Payment'
  AND pt.bank_transaction_id IS NOT NULL
  AND TRIM(COALESCE(bt.memo, '')) <> ''
  AND (
    pt.memo ILIKE '%지출 지급%'
    OR TRIM(COALESCE(pt.memo, '')) IS DISTINCT FROM ('통장 지급: ' || LEFT(TRIM(bt.memo), 200))
  )
ORDER BY pt.trans_date DESC, pt.id DESC
LIMIT 200;
