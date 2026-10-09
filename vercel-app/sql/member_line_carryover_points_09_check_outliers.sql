-- LINE 이월 포인트 — 9번 이상값·잔액 감소 회원 현재 상태 (조회 전용)
-- 1670: LINE 359,860P 오입력 의심 / 2969·2973: LINE total 324,749 / 7359: 첫 적용 때 잔액 감소
SELECT
  m.id,
  m.member_no,
  m.status,
  m.tier_code,
  m.point_balance,
  m.tier_points,
  m.updated_at,
  coalesce(sum(l.points) FILTER (WHERE l.note LIKE 'line_opening%'), 0) AS line_opening_net,
  coalesce(sum(l.points) FILTER (WHERE l.note LIKE 'line_opening%' AND l.points > 0), 0) AS line_opening_credit,
  coalesce(sum(l.points) FILTER (WHERE l.kind IN ('use', 'redeem')), 0) AS used_points,
  coalesce(sum(l.points) FILTER (WHERE l.note NOT LIKE 'line_opening%' OR l.note IS NULL), 0) AS other_ledger_net
FROM public.members m
LEFT JOIN public.member_points_ledger l ON l.member_id = m.id
WHERE m.id IN (1670, 2969, 2973, 7359)
GROUP BY m.id
ORDER BY m.id;
