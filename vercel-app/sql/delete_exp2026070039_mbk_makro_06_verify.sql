-- 6/6 검증: 중복 EXP2026070039 / 통장 #10403 이 없어지고, 원본 #2313 / #10368 은 남아 있어야 함.

SELECT
  src,
  src_id,
  document_no,
  status_or_category,
  amount_abs
FROM (
  SELECT
    'accrual' AS src,
    ea.id::text AS src_id,
    ea.document_no,
    ea.status AS status_or_category,
    ea.amount AS amount_abs
  FROM public.expense_accruals ea
  WHERE ea.id IN (2313, 2316)

  UNION ALL

  SELECT
    'bank' AS src,
    bt.id::text AS src_id,
    bt.document_no,
    coalesce(bt.category, '') AS status_or_category,
    abs(bt.amount::numeric) AS amount_abs
  FROM public.bank_transactions bt
  WHERE bt.id IN (10368, 10403)
) x
ORDER BY src, src_id;
