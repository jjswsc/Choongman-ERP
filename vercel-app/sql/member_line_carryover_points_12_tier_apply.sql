-- LINE 이월 포인트 — 12번 등급 승급 적용 (한 문장 — 파일 전체를 한 번에 Run)
-- 포인트 기준(max(tier_points, line_tier_points)) 승급만, 강등 없음. 등급 이력(member_tier_histories) 기록
-- 11번에서 basis 가 points 일 때만 실행. pos_orders 는 건드리지 않음.
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
),
up AS (
  SELECT p.id, p.cur_code, p.next_code
  FROM pick p
  JOIN tiers tc ON tc.code = p.cur_code
  JOIN tiers tn ON tn.code = p.next_code
  WHERE tn.sort_order > tc.sort_order
),
upd AS (
  UPDATE public.members m
  SET tier_code = u.next_code,
      updated_at = (now() AT TIME ZONE 'Asia/Bangkok')
  FROM up u
  WHERE m.id = u.id
  RETURNING m.id
),
hist AS (
  INSERT INTO public.member_tier_histories (member_id, prev_tier_code, next_tier_code, reason, changed_at)
  SELECT id, cur_code, next_code, 'line_carryover_recalc', (now() AT TIME ZONE 'Asia/Bangkok')
  FROM up
  RETURNING member_id
)
SELECT
  (SELECT count(*) FROM upd) AS members_upgraded,
  (SELECT count(*) FROM hist) AS history_rows,
  (SELECT next_code FROM up WHERE id = 11143) AS m011143_new_tier;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('member_line_carryover_points_12_tier_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
