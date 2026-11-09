-- 적용형: 미리보기에서 확인한 copy_item_id 3건만 해제
-- 6979 Joe(Khun Kyaw) · 6938 Saeng · 7057 Cheer
-- 원본을 awaiting_verify 로 바꿔 매니저가 ยืนยันเสร็จ 누를 수 있게 함
-- (매니저 일정표가 closed 여도 검수 API 는 허용됨)

BEGIN;

UPDATE public.daily_plan_items c
SET
  status = 'done',
  finished_at = COALESCE(c.finished_at, now()),
  actual_minutes = COALESCE(
    c.actual_minutes,
    CASE
      WHEN c.started_at IS NOT NULL THEN GREATEST(
        1,
        ROUND(EXTRACT(EPOCH FROM (now() - c.started_at)) / 60.0)::int
      )
      ELSE NULLIF(c.est_minutes, 0)
    END
  ),
  skip_reason = '',
  updated_at = now()
WHERE c.id IN (6979, 6938, 7057)
  AND c.status IN ('todo', 'doing')
  AND c.delegated_from_item_id IS NOT NULL;

UPDATE public.daily_plan_items s
SET
  status = 'awaiting_verify',
  finished_at = COALESCE(s.finished_at, c.finished_at, now()),
  started_at = COALESCE(s.started_at, c.started_at),
  actual_minutes = COALESCE(s.actual_minutes, c.actual_minutes),
  skip_reason = '',
  updated_at = now()
FROM public.daily_plan_items c
WHERE c.id IN (6979, 6938, 7057)
  AND s.id = c.delegated_from_item_id
  AND s.status = 'delegated'
  AND c.status = 'done';

COMMIT;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('diagnose_daily_plan_delegated_stuck_04_apply_ids.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
