-- 루틴 템플릿 항목에 개인(직원) 지정 컬럼
-- NULL/미설정 = 해당 템플릿을 쓰는 전원. 값이 있으면 그 직원 일정표에만 항목 포함.

ALTER TABLE routine_template_items
  ADD COLUMN IF NOT EXISTS employee_id bigint;

CREATE INDEX IF NOT EXISTS idx_routine_template_items_employee
  ON routine_template_items (employee_id)
  WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN routine_template_items.employee_id IS
  'NULL=템플릿 적용 대상 전원. 설정 시 해당 employee_id 일정표에만 이 항목 포함.';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('daily_plans_07_template_item_employee.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
