-- LINE CRM import 후 중복 회원 후보 검사
-- Supabase SQL Editor → Run (0건이 이상적, 결과는 수동 병합·검토용)

-- 1) 동일 생년월일 + 서로 다른 전화 (active, 전화 있음)
WITH canon AS (
  SELECT
    m.id,
    m.member_no,
    m.name,
    m.full_name,
    m.phone,
    m.birth_date,
    m.tier_code,
    m.point_balance,
    m.tier_points,
    m.source,
    m.line_display_name,
    m.status,
    CASE
      WHEN regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
        THEN '0' || substr(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), 3)
      WHEN length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) = 9
        THEN '0' || regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
      ELSE regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
    END AS phone_canonical
  FROM public.members m
  WHERE m.status = 'active'
    AND m.birth_date IS NOT NULL
    AND nullif(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
)
SELECT
  c.birth_date,
  count(*) AS member_count,
  array_agg(c.member_no ORDER BY c.id) AS member_nos,
  array_agg(c.phone ORDER BY c.id) AS phones,
  array_agg(coalesce(c.full_name, c.name, c.line_display_name) ORDER BY c.id) AS names,
  array_agg(c.tier_code ORDER BY c.id) AS tiers,
  array_agg(c.point_balance ORDER BY c.id) AS point_balances
FROM canon c
GROUP BY c.birth_date
HAVING count(DISTINCT c.phone_canonical) > 1
ORDER BY count(*) DESC, c.birth_date DESC
LIMIT 200;

-- 2) 동일 전화 canonical 중복 (active) — 0건이어야 함
-- SELECT phone_canonical, count(*)
-- FROM (
--   SELECT CASE
--     WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') ~ '^66[0-9]{9,}$'
--       THEN '0'||substr(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),3)
--     WHEN length(regexp_replace(coalesce(phone,''),'[^0-9]','','g'))=9
--       THEN '0'||regexp_replace(coalesce(phone,''),'[^0-9]','','g')
--     ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g')
--   END AS phone_canonical
--   FROM public.members
--   WHERE status='active'
-- ) t
-- WHERE nullif(phone_canonical,'') IS NOT NULL
-- GROUP BY phone_canonical
-- HAVING count(*)>1;

-- 3) line_import + 동일 생년월일 2건 이상 (이름·전화 상이 후보)
-- SELECT birth_date, count(*) AS cnt
-- FROM public.members
-- WHERE status = 'active'
--   AND source = 'line_import'
--   AND birth_date IS NOT NULL
-- GROUP BY birth_date
-- HAVING count(*) >= 2
-- ORDER BY cnt DESC, birth_date DESC
-- LIMIT 100;
