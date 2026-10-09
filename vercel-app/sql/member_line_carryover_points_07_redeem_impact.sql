-- LINE 이월 포인트 — 7번 쿠폰 교환(redeem) 차감 누락 영향 (조회 전용, 5번 실행 후 Run)
-- 만료 크론이 redeem 을 차감으로 안 봐서 교환한 포인트가 다음 날 잔액으로 되돌아온 회원
-- over_credit = 현재 잔액 − 원장 기준 잔액 (코드 배포 후 크론이 이만큼 줄인다)
WITH r AS (
  SELECT l.member_id,
         count(*) AS redeem_count,
         round(-sum(l.points), 2) AS redeemed_points
  FROM public.member_points_ledger l
  WHERE l.kind = 'redeem'
  GROUP BY l.member_id
),
net AS (
  SELECT l.member_id,
         round(greatest(0, coalesce(sum(l.points) FILTER (WHERE l.kind <> 'expire'), 0)), 2) AS ledger_balance
  FROM public.member_points_ledger l
  WHERE l.member_id IN (SELECT member_id FROM r)
  GROUP BY l.member_id
)
SELECT
  m.id,
  m.member_no,
  m.name,
  m.phone,
  r.redeem_count,
  r.redeemed_points,
  m.point_balance AS balance_now,
  n.ledger_balance,
  round(m.point_balance - n.ledger_balance, 2) AS over_credit
FROM r
JOIN net n ON n.member_id = r.member_id
JOIN public.members m ON m.id = r.member_id
WHERE m.point_balance - n.ledger_balance >= 0.01
ORDER BY over_credit DESC
LIMIT 200;
