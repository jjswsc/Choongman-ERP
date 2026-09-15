-- 3/3 True Digital 2026-07~08 전표 — 5420/5430 지급처·적요
-- 전기 청구서가 통신비(5420)로 들어갔는지 확인용.
-- 이것만 복사 → Run.

WITH sub AS (
  SELECT id, code, name
  FROM public.account_subjects
  WHERE code IN ('5420', '5430', '5470')
)
SELECT
  'accrual'::text AS source,
  ea.id,
  ea.expense_date::date AS d,
  s.code,
  s.name,
  ea.status,
  ea.payee_code,
  ea.payee_name,
  ea.memo,
  round(abs(coalesce(ea.amount, 0))::numeric, 2) AS amount
FROM public.expense_accruals ea
JOIN sub s ON s.id = ea.account_subject_id
WHERE ea.expense_date >= DATE '2026-07-01'
  AND ea.expense_date < DATE '2026-09-01'
  AND (
    coalesce(ea.store_name, '') ILIKE '%True Digital%'
    OR btrim(coalesce(ea.store_name, '')) IN ('1040', 'CM True Digital')
  )

UNION ALL

SELECT
  'bank'::text,
  bt.id,
  coalesce(bt.expense_date, bt.trans_date)::date,
  s.code,
  s.name,
  bt.category,
  bt.vendor_code,
  NULL::text,
  bt.memo,
  round(abs(coalesce(bt.amount, 0))::numeric, 2)
FROM public.bank_transactions bt
JOIN sub s ON s.id = bt.account_subject_id
WHERE coalesce(bt.expense_date, bt.trans_date) >= DATE '2026-07-01'
  AND coalesce(bt.expense_date, bt.trans_date) < DATE '2026-09-01'
  AND lower(btrim(coalesce(bt.trans_type, ''))) = 'withdraw'
  AND (
    coalesce(bt.store, '') ILIKE '%True Digital%'
    OR btrim(coalesce(bt.store, '')) IN ('1040', 'CM True Digital')
  )

UNION ALL

SELECT
  'petty'::text,
  pc.id,
  pc.trans_date::date,
  s.code,
  s.name,
  pc.trans_type,
  NULL::text,
  NULL::text,
  pc.memo,
  round(abs(coalesce(pc.amount, 0))::numeric, 2)
FROM public.petty_cash_transactions pc
JOIN sub s ON s.id = pc.account_subject_id
WHERE pc.trans_date >= DATE '2026-07-01'
  AND pc.trans_date < DATE '2026-09-01'
  AND (
    coalesce(pc.store, '') ILIKE '%True Digital%'
    OR btrim(coalesce(pc.store, '')) IN ('1040', 'CM True Digital')
  )

ORDER BY d, code, source, id;
