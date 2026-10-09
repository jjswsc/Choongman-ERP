-- schedules 테이블에 plan_in_prev_day 컬럼 추가 (자정 넘는 근무용)
-- Supabase 대시보드 > SQL Editor에서 실행하세요.

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS plan_in_prev_day BOOLEAN DEFAULT FALSE;
