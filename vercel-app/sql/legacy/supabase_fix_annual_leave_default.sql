-- 연차 기본 6일로 맞추기 (입사일 무관)
-- 1. 기존 직원: annual_leave_days = 6 (전원)
-- 2. 컬럼 기본값: 6 (신규 직원)
-- 실행 전 백업 권장

-- (1) 기존 직원 연차 일괄 6일 설정 (Hourly는 앱에서 0 처리)
UPDATE employees SET annual_leave_days = 6;

-- (2) 컬럼 기본값 6으로 설정 (신규 INSERT 시)
ALTER TABLE employees ALTER COLUMN annual_leave_days SET DEFAULT 6;
