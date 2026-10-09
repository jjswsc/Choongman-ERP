-- LINE 이월 포인트 소실 — 4/6 회원별 미리보기 상위 200명 (조회 전용)
-- missing > 0 : 복구로 잔액이 늘어나는 회원 / missing < 0 : 원장보다 잔액이 많던 회원(쿠폰 교환 차감 누락 등)
WITH carry AS (
  SELECT l.member_id,
         coalesce(sum(l.points) FILTER (WHERE l.points > 0), 0) AS credited,
         coalesce(sum(l.points), 0) AS net
  FROM public.member_points_ledger l
  WHERE l.note LIKE 'line_opening%' OR l.note LIKE 'LINE CRM import%'
  GROUP BY l.member_id
),
ledger_all AS (
  SELECT l.member_id,
         coalesce(sum(l.points) FILTER (WHERE l.kind <> 'expire'), 0) AS ledger_net
  FROM public.member_points_ledger l
  GROUP BY l.member_id
),
base AS (
  SELECT m.id, m.member_no, m.name, m.phone, m.tier_code,
         round(coalesce(m.point_balance, 0)::numeric, 2) AS point_balance,
         round(coalesce(m.line_current_points, 0)::numeric, 2) AS line_cur,
         greatest(
           round(coalesce(m.line_current_points, 0)::numeric, 2),
           round(coalesce(nullif(m.line_tier_points, 0), m.line_total_points, 0)::numeric, 2)
         ) AS line_tier,
         coalesce(c.credited, 0) AS credited,
         coalesce(c.net, 0) AS carry_net,
         coalesce(a.ledger_net, 0) AS ledger_net
  FROM public.members m
  LEFT JOIN carry c ON c.member_id = m.id
  LEFT JOIN ledger_all a ON a.member_id = m.id
  WHERE coalesce(m.status, 'active') <> 'inactive'
),
plan AS (
  SELECT b.*,
         greatest(b.line_tier - b.credited, 0) AS add_credit,
         b.carry_net + greatest(b.line_tier - b.credited, 0) - b.line_cur AS over_net
  FROM base b
  WHERE b.line_tier > 0
)
SELECT
  p.id,
  p.member_no,
  p.name,
  p.phone,
  p.tier_code,
  p.line_cur AS line_current_points,
  p.line_tier AS line_tier_points,
  p.ledger_net AS pos_ledger_net,
  p.point_balance AS balance_now,
  greatest(0, p.ledger_net + p.add_credit - p.over_net) AS balance_after,
  round(greatest(0, p.ledger_net + p.add_credit - p.over_net) - p.point_balance, 2) AS missing
FROM plan p
WHERE p.add_credit > 0 OR abs(p.over_net) >= 0.01
ORDER BY abs(greatest(0, p.ledger_net + p.add_credit - p.over_net) - p.point_balance) DESC, p.id
LIMIT 200;
