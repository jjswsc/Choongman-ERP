-- LINE 이월 포인트 소실 — 6/6 검증 (조회 전용)
-- members_with_line_opening : 이월 원장이 기록된 회원 수 (5번 실행 전이면 0)
-- balance_below_ledger      : 원장보다 잔액이 적은 회원 수 (5번 실행 후 0 이어야 정상)
WITH opening AS (
  SELECT DISTINCT l.member_id
  FROM public.member_points_ledger l
  WHERE l.note LIKE 'line_opening%'
),
net AS (
  SELECT l.member_id,
         round(greatest(0, coalesce(sum(l.points) FILTER (WHERE l.kind <> 'expire'), 0)), 2) AS ledger_balance
  FROM public.member_points_ledger l
  WHERE l.member_id IN (SELECT member_id FROM opening)
  GROUP BY l.member_id
)
SELECT
  (SELECT count(*) FROM opening) AS members_with_line_opening,
  count(n.member_id) FILTER (WHERE round(coalesce(m.point_balance, 0)::numeric, 2) < n.ledger_balance - 0.01) AS balance_below_ledger,
  (SELECT point_balance FROM public.members WHERE id = 11143) AS m011143_balance_now
FROM net n
JOIN public.members m ON m.id = n.member_id;
