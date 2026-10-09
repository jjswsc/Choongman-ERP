-- LINE 이월 포인트 — 10번 M001670 이월 359,860P 되돌리기 (한 문장 — 파일 전체를 한 번에 Run)
-- LINE 엑셀 값 오입력 의심(사용 1회, DIAMOND). 실제 LINE OA 잔액 확인 후 ERP 포인트 조정으로 따로 넣는다.
-- 이월 원장 행 삭제 + 잔액·등급포인트를 나머지 원장 기준으로 재산정
WITH del AS (
  DELETE FROM public.member_points_ledger
  WHERE member_id = 1670 AND note LIKE 'line_opening%'
  RETURNING id
),
rest AS (
  SELECT
    round(greatest(0, coalesce(sum(l.points) FILTER (WHERE l.kind <> 'expire'), 0)), 2) AS net,
    round(coalesce(sum(l.points) FILTER (WHERE l.points > 0 AND l.kind IN ('earn', 'adjust')), 0), 2) AS credit
  FROM public.member_points_ledger l
  WHERE l.member_id = 1670
    AND (l.note IS NULL OR l.note NOT LIKE 'line_opening%')
),
upd AS (
  UPDATE public.members m
  SET point_balance = r.net,
      tier_points = r.credit,
      updated_at = (now() AT TIME ZONE 'Asia/Bangkok')
  FROM rest r
  WHERE m.id = 1670
  RETURNING m.point_balance, m.tier_points
)
SELECT
  (SELECT count(*) FROM del) AS deleted_rows,
  (SELECT point_balance FROM upd) AS point_balance_after,
  (SELECT tier_points FROM upd) AS tier_points_after;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('member_line_carryover_points_10_rollback_m001670.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
