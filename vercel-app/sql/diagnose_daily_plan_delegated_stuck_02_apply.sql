-- 적용형: 위임 사본(todo/doing) → done, 원본(delegated) → awaiting_verify
-- 영업 중 POS 인쇄와 무관 (daily_plan_items 만).
-- ★ 반드시 01_preview 결과를 확인한 뒤 실행. 미리보기 0건이면 실행하지 말 것.
-- 필터: 2026-11-09 · 제목 ต้อนรับ · Saeng 위임. 사진·메모는 이미 동기화된 경우 그대로 둠.

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
FROM public.daily_plans cp
WHERE c.plan_id = cp.id
  AND c.delegated_from_item_id IS NOT NULL
  AND c.status IN ('todo', 'doing')
  AND cp.plan_date = '2026-11-09'
  AND c.title ILIKE '%ต้อนรับ%'
  AND (
    cp.employee_name ILIKE '%Saeng%'
    OR EXISTS (
      SELECT 1
      FROM public.daily_plan_items src0
      WHERE src0.id = c.delegated_from_item_id
        AND src0.delegated_to_name ILIKE '%Saeng%'
    )
  );

UPDATE public.daily_plan_items s
SET
  status = 'awaiting_verify',
  finished_at = COALESCE(s.finished_at, c.finished_at, now()),
  started_at = COALESCE(s.started_at, c.started_at),
  actual_minutes = COALESCE(s.actual_minutes, c.actual_minutes),
  skip_reason = '',
  updated_at = now()
FROM public.daily_plan_items c
JOIN public.daily_plans cp ON cp.id = c.plan_id
WHERE s.id = c.delegated_from_item_id
  AND s.status = 'delegated'
  AND c.status = 'done'
  AND cp.plan_date = '2026-11-09'
  AND c.title ILIKE '%ต้อนรับ%'
  AND (
    cp.employee_name ILIKE '%Saeng%'
    OR s.delegated_to_name ILIKE '%Saeng%'
  );

COMMIT;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('diagnose_daily_plan_delegated_stuck_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
