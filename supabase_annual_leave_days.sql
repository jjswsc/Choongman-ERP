-- 연차일(annual_leave_days) DB값 전부 삭제
-- Supabase SQL Editor에서 실행
-- (앱에서 입사 1년 이상만 6일로 계산하므로 DB 저장 불필요)

UPDATE employees SET annual_leave_days = 0;
