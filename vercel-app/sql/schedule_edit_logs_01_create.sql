-- 근무표 저장 시 직원·날짜별로 바뀐 칸만 남긴다.
-- Supabase SQL Editor에 이 파일 전체를 한 번 붙여넣고 Run.
-- 실행 전 표에는 수정자가 없다. 이 테이블을 만든 뒤 저장분부터 남는다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_edit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NULL,
  store_name TEXT NOT NULL,
  week_monday DATE NULL,
  schedule_date DATE NOT NULL,
  employee_id BIGINT NULL,
  employee_code TEXT NULL,
  employee_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  before_value TEXT NULL,
  after_value TEXT NULL,
  actor_name TEXT NULL,
  actor_role TEXT NULL,
  actor_store TEXT NULL,
  actor_employee_id BIGINT NULL,
  actor_employee_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_edit_logs_store_date
  ON public.schedule_edit_logs (store_name, schedule_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_edit_logs_employee
  ON public.schedule_edit_logs (employee_id, schedule_date, created_at DESC);

ALTER TABLE public.schedule_edit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all schedule_edit_logs" ON public.schedule_edit_logs;
CREATE POLICY "Allow all schedule_edit_logs" ON public.schedule_edit_logs
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.schedule_edit_logs IS '주간 근무표 저장 시 직원·날짜·항목별 변경 (수정자·방콕 시각은 created_at을 Asia/Bangkok으로 표시)';

COMMIT;
