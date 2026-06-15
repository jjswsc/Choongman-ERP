-- 오피스(본사) 급여 조회·계산·확정 담당자 — 직원별 플래그 (역할·직무와 무관)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS can_manage_office_payroll boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.can_manage_office_payroll IS '오피스(본사) 급여 조회·계산·확정 권한. Director는 플래그 없이도 접근·지정 가능.';
