-- 근면수당(월 1회, 무지각·무휴가·무결석 시 지급). 인사 화면에서 금액 설정, NULL이면 앱에서 500바트 기본.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS attendance_allowance numeric;

COMMENT ON COLUMN employees.attendance_allowance IS '근면수당(바트/월). 0=미적용. NULL 시 앱 기본 500.';

-- 확정 급여 저장
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS diligence_allow numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN payroll_records.diligence_allow IS '근면수당(확정 급여)';
