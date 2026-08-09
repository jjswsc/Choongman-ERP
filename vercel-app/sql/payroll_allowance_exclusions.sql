-- 공지 미확인 패널티: 급여월별 직책·위험·근면수당 제외 플래그
-- Supabase SQL Editor에 붙여넣고 실행

CREATE TABLE IF NOT EXISTS payroll_allowance_exclusions (
  id bigserial PRIMARY KEY,
  payroll_month text NOT NULL,
  employee_id bigint,
  store text NOT NULL,
  name text NOT NULL,
  reason text NOT NULL DEFAULT 'notice_unread',
  notice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  missed_count integer NOT NULL DEFAULT 0,
  period_start date,
  period_end date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_allowance_exclusions_month_chk
    CHECK (payroll_month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT payroll_allowance_exclusions_uniq
    UNIQUE (payroll_month, store, name)
);

CREATE INDEX IF NOT EXISTS idx_payroll_allowance_exclusions_month
  ON payroll_allowance_exclusions (payroll_month);

CREATE INDEX IF NOT EXISTS idx_payroll_allowance_exclusions_emp
  ON payroll_allowance_exclusions (employee_id)
  WHERE employee_id IS NOT NULL;

COMMENT ON TABLE payroll_allowance_exclusions IS
  '공지 미확인 등으로 해당 급여월 직책·위험·근면수당을 0 처리하는 플래그. getPayrollCalc가 참조.';
