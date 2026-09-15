-- 5/8 정정 반영 — True Digital 위즈덤 공과 → 5430 전기료, 광고 150 → 5525
-- 미리보기(4/8) 확인 후 이것만 복사 → Run.
-- pos_orders 아님. POS Realtime 인쇄와 무관.

BEGIN;

WITH dest AS (
  SELECT
    (SELECT id FROM public.account_subjects WHERE code = '5430' LIMIT 1) AS electric_id,
    (SELECT name FROM public.account_subjects WHERE code = '5430' LIMIT 1) AS electric_name,
    (SELECT id FROM public.account_subjects WHERE code = '5525' LIMIT 1) AS ad_id,
    (SELECT name FROM public.account_subjects WHERE code = '5525' LIMIT 1) AS ad_name
)
UPDATE public.bank_transactions bt
SET account_subject_id = CASE
  WHEN bt.id = 12639 THEN dest.ad_id
  ELSE dest.electric_id
END
FROM dest
WHERE bt.id IN (12623, 12061, 12639)
  AND dest.electric_id IS NOT NULL
  AND dest.ad_id IS NOT NULL;

WITH dest AS (
  SELECT
    (SELECT id FROM public.account_subjects WHERE code = '5430' LIMIT 1) AS electric_id,
    (SELECT id FROM public.account_subjects WHERE code = '5525' LIMIT 1) AS ad_id
)
UPDATE public.expense_accruals ea
SET account_subject_id = CASE
  WHEN ea.id = 2795 THEN dest.ad_id
  ELSE dest.electric_id
END
FROM dest
WHERE ea.id IN (2366, 2749, 2795)
  AND dest.electric_id IS NOT NULL
  AND dest.ad_id IS NOT NULL;

WITH dest AS (
  SELECT
    (SELECT id FROM public.account_subjects WHERE code = '5430' LIMIT 1) AS electric_id,
    (SELECT name FROM public.account_subjects WHERE code = '5430' LIMIT 1) AS electric_name,
    (SELECT id FROM public.account_subjects WHERE code = '5525' LIMIT 1) AS ad_id,
    (SELECT name FROM public.account_subjects WHERE code = '5525' LIMIT 1) AS ad_name
)
UPDATE public.journal_lines jl
SET
  account_subject_id = CASE
    WHEN je.source_id = 12639 AND je.source_type = 'bank_transaction' THEN dest.ad_id
    WHEN je.source_id = 2795 AND je.source_type = 'expense_accrual' THEN dest.ad_id
    ELSE dest.electric_id
  END,
  account_code = CASE
    WHEN je.source_id = 12639 AND je.source_type = 'bank_transaction' THEN '5525'
    WHEN je.source_id = 2795 AND je.source_type = 'expense_accrual' THEN '5525'
    ELSE '5430'
  END,
  account_name = CASE
    WHEN je.source_id = 12639 AND je.source_type = 'bank_transaction' THEN dest.ad_name
    WHEN je.source_id = 2795 AND je.source_type = 'expense_accrual' THEN dest.ad_name
    ELSE dest.electric_name
  END
FROM public.journal_entries je, dest
WHERE jl.journal_entry_id = je.id
  AND jl.account_code = '5420'
  AND dest.electric_id IS NOT NULL
  AND dest.ad_id IS NOT NULL
  AND (
    (je.source_type = 'bank_transaction' AND je.source_id IN (12623, 12061, 12639))
    OR (je.source_type = 'expense_accrual' AND je.source_id IN (2366, 2749, 2795))
  );

COMMIT;
