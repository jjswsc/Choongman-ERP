-- LINE 이월 포인트 소실 — 3/6 전체 영향 규모 (조회 전용)
-- 원인: 포인트 만료 크론이 잔액을 원장만으로 재계산 → 원장 행 없이 들어간 LINE CRM 이월 포인트가 0으로 덮어써짐
-- expected_balance = 원장 + 이월 보정행 반영 후 잔액, missing = expected_balance − 현재 잔액
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
  SELECT m.id,
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
),
target AS (
  SELECT p.*,
         greatest(0, p.ledger_net + p.add_credit - p.over_net) AS expected_balance
  FROM plan p
  WHERE p.add_credit > 0 OR abs(p.over_net) >= 0.01
)
SELECT
  count(*) AS members_to_fix,
  count(*) FILTER (WHERE expected_balance - point_balance >= 0.01) AS members_balance_up,
  round(coalesce(sum(expected_balance - point_balance) FILTER (WHERE expected_balance - point_balance >= 0.01), 0), 2) AS points_restored,
  count(*) FILTER (WHERE expected_balance - point_balance <= -0.01) AS members_balance_down,
  round(coalesce(sum(expected_balance - point_balance) FILTER (WHERE expected_balance - point_balance <= -0.01), 0), 2) AS points_reduced
FROM target;
