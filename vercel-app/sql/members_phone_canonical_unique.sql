-- 회원 전화번호 정규화 + 선행0 없는 번호까지 중복 방지
-- 실행: Supabase SQL Editor에 붙여넣기 → Run
-- 선행: 앱에서 전화번호(0유/무) 중복 병합 완료 후 권장

-- 1) active 회원 phone을 태국 로컬 10자리(0…)로 통일
UPDATE public.members m
SET
  phone = CASE
    WHEN regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
      THEN '0' || substr(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), 3)
    WHEN length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) = 9
      THEN '0' || regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
    ELSE regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
  END,
  updated_at = (now() AT TIME ZONE 'Asia/Bangkok')
WHERE nullif(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
  AND (
    (m.phone IS DISTINCT FROM CASE
      WHEN regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
        THEN '0' || substr(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), 3)
      WHEN length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) = 9
        THEN '0' || regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
      ELSE regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
    END)
  );

-- 2) 기존 digit unique → 정규화(canonical) unique로 교체
DROP INDEX IF EXISTS public.uq_members_phone_digits;

CREATE UNIQUE INDEX IF NOT EXISTS uq_members_phone_canonical
ON public.members (
  (
    CASE
      WHEN regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
        THEN '0' || substr(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 3)
      WHEN length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) = 9
        THEN '0' || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
      ELSE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
    END
  )
)
WHERE status = 'active'
  AND nullif(
  CASE
    WHEN regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
      THEN '0' || substr(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 3)
    WHEN length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) = 9
      THEN '0' || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
    ELSE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
  END,
  ''
) IS NOT NULL;

-- 3) 확인 (0건이어야 함)
-- SELECT canonical, count(*) FROM (
--   SELECT CASE
--     WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') ~ '^66[0-9]{9,}$'
--       THEN '0'||substr(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),3)
--     WHEN length(regexp_replace(coalesce(phone,''),'[^0-9]','','g'))=9
--       THEN '0'||regexp_replace(coalesce(phone,''),'[^0-9]','','g')
--     ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g')
--   END AS canonical
--   FROM public.members
--   WHERE status='active'
-- ) t
-- WHERE nullif(canonical,'') IS NOT NULL
-- GROUP BY canonical HAVING count(*)>1;
