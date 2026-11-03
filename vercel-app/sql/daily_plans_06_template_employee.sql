-- 루틴 템플릿에 개인(직원) 지정 컬럼 추가
-- 0/NULL = 직급·매장 공통 (기존과 동일). 값이 있으면 해당 직원 일정표 생성 시에만 사용.

ALTER TABLE routine_templates
  ADD COLUMN IF NOT EXISTS employee_id bigint;

CREATE INDEX IF NOT EXISTS idx_routine_templates_employee
  ON routine_templates (employee_id)
  WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN routine_templates.employee_id IS
  'NULL=직급·매장 공통 템플릿. 설정 시 해당 employee_id 일정표에만 적용(역할 템플릿보다 우선).';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('daily_plans_06_template_employee.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
