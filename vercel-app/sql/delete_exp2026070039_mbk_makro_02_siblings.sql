-- 2/4 미리보기: CM MBK · 2026-07-31 · ฿1,031.43 / มาโคร / CP Extra 중복 후보
-- 조회만. 삭제 금지.
-- 같은 날 같은 금액의 다른 EXP·통장이 있으면 이 건만 지울지, 통장도 지울지 판단합니다.

SELECT
  'accrual' AS src,
  ea.id::text AS src_id,
  ea.document_no,
  ea.status AS status_or_category,
  ea.store_name,
  ea.payee_name AS payee_or_vendor,
  ea.amount AS amount_abs,
  ea.expense_date::text AS dt,
  left(coalesce(ea.memo, ''), 120) AS memo
FROM public.expense_accruals ea
WHERE ea.store_name ILIKE '%MBK%'
  AND ea.expense_date = DATE '2026-07-31'
  AND (
    abs(ea.amount::numeric - 1031.43) < 0.02
    OR coalesce(ea.memo, '') ILIKE '%มาโคร%'
    OR coalesce(ea.memo, '') ILIKE '%makro%'
    OR coalesce(ea.payee_name, '') ILIKE '%CP Extra%'
    OR coalesce(ea.document_no, '') = 'EXP2026070039'
  )

UNION ALL

SELECT
  'bank' AS src,
  bt.id::text AS src_id,
  bt.document_no,
  coalesce(bt.category, '') AS status_or_category,
  bt.store_name,
  coalesce(bt.vendor_code, '') AS payee_or_vendor,
  abs(bt.amount::numeric) AS amount_abs,
  left(bt.trans_date::text, 10) AS dt,
  left(coalesce(bt.memo, '') || ' | ' || coalesce(bt.note, ''), 160) AS memo
FROM public.bank_transactions bt
WHERE left(bt.trans_date::text, 10) = '2026-07-31'
  AND abs(bt.amount::numeric) BETWEEN 1031.40 AND 1031.46
  AND (
    coalesce(bt.store_name, '') ILIKE '%MBK%'
    OR coalesce(bt.memo, '') ILIKE '%มาโคร%'
    OR coalesce(bt.memo, '') ILIKE '%makro%'
    OR bt.id = 10403
    OR coalesce(bt.document_no, '') = 'EXP2026070039'
  )

ORDER BY src, src_id;
