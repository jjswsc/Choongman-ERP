-- 직원 급여 변경 이력 테이블
-- 실행: Supabase 대시보드 > SQL Editor > Run
CREATE TABLE IF NOT EXISTS employee_salary_history (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  old_sal_type TEXT,
  new_sal_type TEXT,
  old_sal_amt NUMERIC(12,2) DEFAULT 0,
  new_sal_amt NUMERIC(12,2) DEFAULT 0,
  old_position_allowance NUMERIC(12,2) DEFAULT 0,
  new_position_allowance NUMERIC(12,2) DEFAULT 0,
  old_haz_allow NUMERIC(12,2) DEFAULT 0,
  new_haz_allow NUMERIC(12,2) DEFAULT 0,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_emp_sal_hist_employee ON employee_salary_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_sal_hist_store_name ON employee_salary_history(store, name);
CREATE INDEX IF NOT EXISTS idx_emp_sal_hist_changed_at ON employee_salary_history(changed_at DESC);

ALTER TABLE employee_salary_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON employee_salary_history;
CREATE POLICY "Allow all for anon" ON employee_salary_history FOR ALL USING (true) WITH CHECK (true);
