-- 연차일(annual_leave_days) DB값 전부 초기화
-- Supabase SQL Editor에서 실행
-- (앱에서 입사 1년 이상만 6일로 계산하므로 DB 저장 불필요. NULL로 두면 앱이 자동 계산)
-- 주의: 0으로 두면 이전 버전에서 '직접 입력'으로 인식되어 연차가 0으로 나올 수 있음. NULL 사용 권장.

UPDATE employees SET annual_leave_days = NULL;
