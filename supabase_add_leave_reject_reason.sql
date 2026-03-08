-- 연차 반려 사유 컬럼 추가 (연차승인 반려 시 사유, 모바일에서 확인 가능)
-- Supabase SQL Editor에서 실행

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT DEFAULT NULL;
