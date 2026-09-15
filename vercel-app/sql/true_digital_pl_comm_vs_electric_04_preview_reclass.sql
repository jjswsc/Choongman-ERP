-- 4/8 정정 미리보기 — True Digital 5420 전표의 옮길 계정
-- 손익·지급예정 미변경. 이것만 복사 → Run.

SELECT
  x.source,
  x.id,
  x.d,
  x.payee,
  x.memo,
  x.amount,
  '5420'::text AS from_code,
  x.to_code,
  x.to_name
FROM (
  SELECT
    'bank'::text AS source,
    bt.id,
    coalesce(bt.expense_date, bt.trans_date)::date AS d,
    coalesce(bt.vendor_code, '') AS payee,
    bt.memo,
    round(abs(coalesce(bt.amount, 0))::numeric, 2) AS amount,
    CASE
      WHEN bt.id = 12639 THEN '5525'
      ELSE '5430'
    END AS to_code,
    CASE
      WHEN bt.id = 12639 THEN '광고비'
      ELSE '전기료'
    END AS to_name
  FROM public.bank_transactions bt
  WHERE bt.id IN (12623, 12061, 12639)

  UNION ALL

  SELECT
    'accrual'::text,
    ea.id,
    ea.expense_date::date,
    coalesce(ea.payee_name, ea.payee_code, ''),
    ea.memo,
    round(abs(coalesce(ea.amount, 0))::numeric, 2),
    CASE
      WHEN ea.id = 2795 THEN '5525'
      ELSE '5430'
    END,
    CASE
      WHEN ea.id = 2795 THEN '광고비'
      ELSE '전기료'
    END
  FROM public.expense_accruals ea
  WHERE ea.id IN (2366, 2749, 2795)
) x
ORDER BY x.d, x.source, x.id;
