-- LINE CRM import 중복 병합 후보 (생년월일 정확히 2명 + 전화 상이)
-- Supabase SQL Editor → Run → CSV Export 후 검토
-- 자동 병합: score>=9 (이름 일치 + LINE 1명 + line_import) — 앱 스크립트 run-merge-line-import-birth-duplicates.cjs --apply
-- score 6~8 (이름 불일치): line-import-merge-manual-review.csv 수동 검토

WITH active AS (
  SELECT
    m.id,
    m.member_no,
    coalesce(m.full_name, m.name, m.line_display_name) AS display_name,
    m.phone,
    m.birth_date,
    m.tier_code,
    m.point_balance,
    m.tier_points,
    m.source,
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
),
pairs AS (
  SELECT
    a.birth_date,
    count(*) AS member_count,
    count(DISTINCT a.phone_canonical) AS distinct_phones
  FROM active a
  GROUP BY a.birth_date
  HAVING count(*) = 2
    AND count(DISTINCT a.phone_canonical) = 2
),
line_ids AS (
  SELECT DISTINCT mi.member_id
  FROM public.member_identities mi
  WHERE mi.provider = 'line'
    AND coalesce(mi.status, 'active') = 'active'
)
SELECT
  p.birth_date,
  a1.id AS member_a_id,
  a1.member_no AS member_a_no,
  a1.display_name AS member_a_name,
  a1.phone_canonical AS member_a_phone,
  a1.point_balance AS member_a_points,
  a1.source AS member_a_source,
  (l1.member_id IS NOT NULL) AS member_a_has_line,
  a2.id AS member_b_id,
  a2.member_no AS member_b_no,
  a2.display_name AS member_b_name,
  a2.phone_canonical AS member_b_phone,
  a2.point_balance AS member_b_points,
  a2.source AS member_b_source,
  (l2.member_id IS NOT NULL) AS member_b_has_line,
  (
    CASE WHEN a1.source = 'line_import' AND a2.source = 'line_import' THEN 2 ELSE 0 END
    + CASE
      WHEN (l1.member_id IS NOT NULL AND l2.member_id IS NULL)
        OR (l1.member_id IS NULL AND l2.member_id IS NOT NULL) THEN 4
      WHEN l1.member_id IS NOT NULL AND l2.member_id IS NOT NULL THEN -999
      ELSE 0
    END
    + CASE
      WHEN lower(coalesce(a1.display_name, '')) = lower(coalesce(a2.display_name, '')) THEN 3
      ELSE 0
    END
  ) AS merge_score_hint
FROM pairs p
JOIN active a1 ON a1.birth_date = p.birth_date AND a1.id = (
  SELECT min(x.id) FROM active x WHERE x.birth_date = p.birth_date
)
JOIN active a2 ON a2.birth_date = p.birth_date AND a2.id = (
  SELECT max(x.id) FROM active x WHERE x.birth_date = p.birth_date
)
LEFT JOIN line_ids l1 ON l1.member_id = a1.id
LEFT JOIN line_ids l2 ON l2.member_id = a2.id
WHERE a1.id <> a2.id
ORDER BY merge_score_hint DESC, p.birth_date DESC
LIMIT 500;
