-- 2/3 True Digital 월별 합계 — 5420 통신비 / 5430 전기료 / 5470 통신비(전화)
-- 2026-03~08. 출처별(지급예정·통장·패티)로 나눠 이중집계를 구분합니다.
-- 이것만 복사 → Run.

WITH sub AS (
  SELECT id, code, name
  FROM public.account_subjects
  WHERE code IN ('5420', '5430', '5470')
),
src AS (
  SELECT
    'accrual'::text AS source,
    ea.expense_date::date AS d,
    s.code,
    s.name,
    abs(coalesce(ea.amount, 0))::numeric AS amt
  FROM public.expense_accruals ea
  JOIN sub s ON s.id = ea.account_subject_id
  WHERE ea.expense_date >= DATE '2026-03-01'
    AND ea.expense_date < DATE '2026-09-01'
    AND lower(btrim(coalesce(ea.status, ''))) IN ('approved', 'partial', 'paid')
    AND (
      coalesce(ea.store_name, '') ILIKE '%True Digital%'
      OR btrim(coalesce(ea.store_name, '')) IN ('1040', 'CM True Digital')
    )

  UNION ALL

  SELECT
    'bank'::text,
    coalesce(bt.expense_date, bt.trans_date)::date,
    s.code,
    s.name,
    abs(coalesce(bt.amount, 0))::numeric
  FROM public.bank_transactions bt
  JOIN sub s ON s.id = bt.account_subject_id
  WHERE coalesce(bt.expense_date, bt.trans_date) >= DATE '2026-03-01'
    AND coalesce(bt.expense_date, bt.trans_date) < DATE '2026-09-01'
    AND lower(btrim(coalesce(bt.trans_type, ''))) = 'withdraw'
    AND (
      coalesce(bt.store, '') ILIKE '%True Digital%'
      OR btrim(coalesce(bt.store, '')) IN ('1040', 'CM True Digital')
    )

  UNION ALL

  SELECT
    'petty'::text,
    pc.trans_date::date,
    s.code,
    s.name,
    abs(coalesce(pc.amount, 0))::numeric
  FROM public.petty_cash_transactions pc
  JOIN sub s ON s.id = pc.account_subject_id
  WHERE pc.trans_date >= DATE '2026-03-01'
    AND pc.trans_date < DATE '2026-09-01'
    AND lower(btrim(coalesce(pc.trans_type, ''))) = 'expense'
    AND (
      coalesce(pc.store, '') ILIKE '%True Digital%'
      OR btrim(coalesce(pc.store, '')) IN ('1040', 'CM True Digital')
    )
)
SELECT
  to_char(d, 'YYYY-MM') AS year_month,
  code,
  name,
  source,
  round(sum(amt), 2) AS amount_sum,
  count(*) AS row_cnt
FROM src
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 4;
