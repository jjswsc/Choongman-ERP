-- 6/8 계정명 정정 — 5420 영문 Utilities(공과) → Communication(통신)
-- 태국어명도 넣어 영어 UI에서 전기로 오인하지 않게 합니다.
-- 이것만 복사 → Run.

BEGIN;

UPDATE public.account_subjects
SET
  name_en = 'Communication',
  name_th = 'ค่าสื่อสาร'
WHERE code = '5420'
  AND id = 6;

UPDATE public.account_subjects
SET name_th = coalesce(nullif(btrim(name_th), ''), 'ค่าไฟฟ้า')
WHERE code = '5430'
  AND id = 7;

UPDATE public.account_subjects
SET name_th = coalesce(nullif(btrim(name_th), ''), 'ค่าโทรศัพท์')
WHERE code = '5470'
  AND id = 11;

COMMIT;
