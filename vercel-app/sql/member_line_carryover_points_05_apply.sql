-- LINE 이월 포인트 소실 — 5/6 복구 적용 (한 문장 — 파일 전체를 한 번에 Run)
-- 1) LINE 이월분을 원장 행(adjust, note=line_opening_balance / line_opening_used)으로 기록
-- 2) members.point_balance · tier_points 는 원장 기준값으로 "올리기만" 한다 (현재보다 낮추지 않음)
-- LINE 값 5,000P 초과(엑셀 오입력 의심)는 제외 → 8번 파일로 따로 확인
-- pos_orders 는 건드리지 않음 → POS 자동인쇄 영향 없음. 재실행해도 이미 맞춘 회원은 대상에서 빠진다.
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
         coalesce(sum(l.points) FILTER (WHERE l.kind <> 'expire'), 0) AS ledger_net,
         coalesce(sum(l.points) FILTER (WHERE l.points > 0 AND l.kind IN ('earn', 'adjust')), 0) AS ledger_credit,
         min(l.created_at) AS first_at
  FROM public.member_points_ledger l
  GROUP BY l.member_id
),
base AS (
  SELECT m.id,
         m.line_exported_at,
         a.first_at,
         round(coalesce(m.point_balance, 0)::numeric, 2) AS point_balance,
         round(coalesce(m.tier_points, 0)::numeric, 2) AS tier_points,
         round(coalesce(m.line_current_points, 0)::numeric, 2) AS line_cur,
         greatest(
           round(coalesce(m.line_current_points, 0)::numeric, 2),
           round(coalesce(nullif(m.line_tier_points, 0), m.line_total_points, 0)::numeric, 2)
         ) AS line_tier,
         coalesce(c.credited, 0) AS credited,
         coalesce(c.net, 0) AS carry_net,
         coalesce(a.ledger_net, 0) AS ledger_net,
         coalesce(a.ledger_credit, 0) AS ledger_credit
  FROM public.members m
  LEFT JOIN carry c ON c.member_id = m.id
  LEFT JOIN ledger_all a ON a.member_id = m.id
  WHERE coalesce(m.status, 'active') <> 'inactive'
),
plan AS (
  SELECT b.*,
         round(greatest(b.line_tier - b.credited, 0), 2) AS add_credit,
         round(b.carry_net + greatest(b.line_tier - b.credited, 0) - b.line_cur, 2) AS over_net
  FROM base b
  WHERE b.line_tier > 0 AND b.line_tier <= 5000
),
target AS (
  SELECT p.id AS member_id,
         p.add_credit,
         p.over_net,
         coalesce(p.line_exported_at, p.first_at, (now() AT TIME ZONE 'Asia/Bangkok'))::timestamp AS opening_at,
         p.point_balance,
         p.tier_points,
         round(greatest(0, p.ledger_net + p.add_credit - p.over_net), 2) AS ledger_balance,
         round(p.ledger_credit + p.add_credit + greatest(-p.over_net, 0), 2) AS ledger_tier
  FROM plan p
  WHERE p.add_credit > 0 OR abs(p.over_net) >= 0.01
),
ins_credit AS (
  INSERT INTO public.member_points_ledger (member_id, order_id, kind, points, amount, note, created_at)
  SELECT member_id, NULL, 'adjust', add_credit, 0, 'line_opening_balance', opening_at
  FROM target
  WHERE add_credit > 0
  RETURNING member_id
),
ins_net AS (
  -- 같은 문장 안 INSERT 순서는 보장되지 않으므로 1초 뒤 시각으로 넣어 원장 재생 순서(적립 → 차감)를 고정
  INSERT INTO public.member_points_ledger (member_id, order_id, kind, points, amount, note, created_at)
  SELECT member_id, NULL, 'adjust', -over_net, 0,
         CASE WHEN over_net > 0 THEN 'line_opening_used' ELSE 'line_opening_balance' END,
         opening_at + interval '1 second'
  FROM target
  WHERE abs(over_net) >= 0.01
  RETURNING member_id
),
upd AS (
  UPDATE public.members m
  SET point_balance = greatest(t.point_balance, t.ledger_balance),
      tier_points = greatest(t.tier_points, t.ledger_tier),
      updated_at = (now() AT TIME ZONE 'Asia/Bangkok')
  FROM target t
  WHERE m.id = t.member_id
    AND (t.ledger_balance > t.point_balance OR t.ledger_tier > t.tier_points)
  RETURNING m.id
)
SELECT
  (SELECT count(*) FROM target) AS planned_members,
  (SELECT count(*) FROM ins_credit) AS credit_rows,
  (SELECT count(*) FROM ins_net) AS net_rows,
  (SELECT count(*) FROM upd) AS members_topped_up;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('member_line_carryover_points_05_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
