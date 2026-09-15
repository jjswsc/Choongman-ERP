-- 8/8 검증 — True Digital 정정 전표 계정코드
-- 5/8 반영 후 이것만 복사 → Run.
-- 기대: 12623·12061·2366·2749 = 5430, 12639·2795 = 5525

SELECT
  x.source,
  x.id,
  x.d,
  s.code,
  s.name,
  x.memo,
  x.amount
FROM (
  SELECT
    'bank'::text AS source,
    bt.id,
    coalesce(bt.expense_date, bt.trans_date)::date AS d,
    bt.account_subject_id AS sid,
    bt.memo,
    round(abs(coalesce(bt.amount, 0))::numeric, 2) AS amount
  FROM public.bank_transactions bt
  WHERE bt.id IN (12623, 12061, 12639)

  UNION ALL

  SELECT
    'accrual'::text,
    ea.id,
    ea.expense_date::date,
    ea.account_subject_id,
    ea.memo,
    round(abs(coalesce(ea.amount, 0))::numeric, 2)
  FROM public.expense_accruals ea
  WHERE ea.id IN (2366, 2749, 2795)
) x
JOIN public.account_subjects s ON s.id = x.sid
ORDER BY x.d, x.source, x.id;
