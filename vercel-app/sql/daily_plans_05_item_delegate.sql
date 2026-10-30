-- 일정표 항목 위임(매니저/SV → 직원) 컬럼
-- DDL만. 기존 행 UPDATE 없음. Realtime pos_orders 무관 → 영업 중 실행 가능.

ALTER TABLE daily_plan_items
  ADD COLUMN IF NOT EXISTS delegated_to_employee_id bigint,
  ADD COLUMN IF NOT EXISTS delegated_to_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delegated_from_item_id bigint,
  ADD COLUMN IF NOT EXISTS delegated_by_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_daily_plan_items_delegated_from
  ON daily_plan_items (delegated_from_item_id)
  WHERE delegated_from_item_id IS NOT NULL;

COMMENT ON COLUMN daily_plan_items.delegated_to_employee_id IS '위임 대상 직원 id (원본 항목)';
COMMENT ON COLUMN daily_plan_items.delegated_to_name IS '위임 대상 표시 이름';
COMMENT ON COLUMN daily_plan_items.delegated_from_item_id IS '직원 사본이 가리키는 원본 항목 id';
COMMENT ON COLUMN daily_plan_items.delegated_by_name IS '위임한 사람 이름';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('daily_plans_05_item_delegate.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
