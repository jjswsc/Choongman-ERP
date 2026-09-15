-- 1/3 계정과목 이름 — 5420 영문이 Utilities(공과/전기)로 잘못 들어가 있는지 확인
-- 이것만 복사 → Run.

SELECT
  id,
  code,
  name AS name_ko,
  name_en,
  name_th,
  type,
  p_and_l_section
FROM public.account_subjects
WHERE code IN ('5420', '5430', '5470')
ORDER BY code;
