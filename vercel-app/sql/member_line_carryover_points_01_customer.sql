-- LINE 이월 포인트 소실 — 1/6 컴플레인 회원 M011143 (0839033388) 잔액 vs LINE 이월값
-- 조회 전용
SELECT
  m.id,
  m.member_no,
  m.name,
  m.phone,
  m.status,
  m.source,
  m.tier_code,
  m.point_balance,
  m.tier_points,
  m.line_current_points,
  m.line_total_points,
  m.line_tier_points,
  m.line_exported_at,
  m.created_at,
  (SELECT count(*) FROM public.member_points_ledger l WHERE l.member_id = m.id) AS ledger_rows,
  (SELECT coalesce(sum(l.points), 0) FROM public.member_points_ledger l
    WHERE l.member_id = m.id AND l.kind <> 'expire') AS ledger_net
FROM public.members m
WHERE m.id = 11143;
