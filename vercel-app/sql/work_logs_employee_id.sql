-- 업무일지: 직원 식별을 이름 문자열에만 의존하지 않도록 employees.id 연동
-- Supabase SQL Editor에서 한 번 실행 (배포된 DB에 컬럼이 없으면 INSERT/조회가 실패할 수 있음)

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS employee_id INTEGER;

COMMENT ON COLUMN work_logs.employee_id IS 'employees.id — 저장·조회·필터 시 이름 오매칭 방지';

CREATE INDEX IF NOT EXISTS idx_work_logs_employee_id ON work_logs(employee_id);
