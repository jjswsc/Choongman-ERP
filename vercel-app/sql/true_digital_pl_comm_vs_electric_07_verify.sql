-- 7/8 검증 — 정정 후 계정명·트루 7·8월 5420/5430/5525
-- 이것만 복사 → Run.

SELECT
  id,
  code,
  name AS name_ko,
  name_en,
  name_th
FROM public.account_subjects
WHERE code IN ('5420', '5430', '5470', '5525')
ORDER BY code;
