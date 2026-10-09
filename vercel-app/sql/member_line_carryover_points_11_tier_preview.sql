-- LINE 이월 포인트 — 11번 등급 승급 대상 미리보기 (조회 전용)
-- 복구로 tier_points 가 올랐지만 등급은 재계산되지 않은 회원 — 포인트 기준 승급만 (강등 없음)
-- basis 열이 points 가 아니면(금액 기준) 12번을 실행하지 않는다
WITH tiers AS (
  SELECT upper(code) AS code, sort_order, min_points
  FROM public.member_tiers
),
q AS (
  SELECT m.id,
         upper(coalesce(nullif(trim(m.tier_code), ''), 'BRONZE')) AS cur_code,
         greatest(coalesce(m.tier_points, 0), coalesce(m.line_tier_points, 0)) AS qual
  FROM public.members m
  WHERE coalesce(m.status, 'active') <> 'inactive'
),
pick AS (
  SELECT q.*,
         (SELECT t.code FROM tiers t WHERE q.qual >= t.min_points ORDER BY t.sort_order DESC LIMIT 1) AS next_code
  FROM q
)
SELECT
  (SELECT value_json::text FROM public.system_settings WHERE key = 'member_tier_upgrade_basis') AS basis,
  p.cur_code AS from_tier,
  p.next_code AS to_tier,
  count(*) AS members,
  bool_or(p.id = 11143) AS includes_m011143
FROM pick p
JOIN tiers tc ON tc.code = p.cur_code
JOIN tiers tn ON tn.code = p.next_code
WHERE tn.sort_order > tc.sort_order
GROUP BY p.cur_code, p.next_code
ORDER BY p.cur_code, p.next_code;
