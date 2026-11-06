-- 일정표 취소·재생성 금지.
-- 공개된 일정을 지울 때는 행을 남기고 status=cancelled 로 둔다.
-- suppress_auto 는 미공개 삭제·이동 뒤 18:00 자동 생성이 그 칸을 다시 만들지 않게 한다.

ALTER TABLE daily_plans
  ADD COLUMN IF NOT EXISTS cancel_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS suppress_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text NOT NULL DEFAULT '';

COMMENT ON COLUMN daily_plans.cancel_reason IS '취소 사유 코드 (wrong_person, wrong_store, duplicate, not_needed, moved)';
COMMENT ON COLUMN daily_plans.suppress_auto IS 'true 이면 이 날짜·직원 일정표를 자동 생성으로 되살리지 않음';
COMMENT ON COLUMN daily_plans.cancelled_at IS '매니저가 일정을 취소한 시각';
COMMENT ON COLUMN daily_plans.cancelled_by IS '취소한 사람 이름';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('daily_plans_08_cancel.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
