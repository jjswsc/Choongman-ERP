-- LINE 이월 포인트 — 8번 5,000P 초과 이상값 (자동 복구 제외 대상, 조회 전용)
SELECT
  m.id,
  m.member_no,
  m.name,
  m.full_name,
  m.line_display_name,
  m.phone,
  m.tier_code,
  m.line_membership_tier,
  m.line_current_points,
  m.line_total_points,
  m.line_tier_points,
  m.line_usage_count,
  m.line_registered_at,
  m.line_exported_at,
  m.point_balance
FROM public.members m
WHERE greatest(
        coalesce(m.line_current_points, 0),
        coalesce(m.line_tier_points, 0),
        coalesce(m.line_total_points, 0)
      ) > 5000
ORDER BY m.line_current_points DESC NULLS LAST;
