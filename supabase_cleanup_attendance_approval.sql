-- ============================================================
-- 근태 기록 / 승인 데이터 삭제
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- 실행 전 백업 권장: Supabase > Database > Backups
-- ============================================================

-- 출퇴근 기록 (근태 로그)
TRUNCATE TABLE attendance_logs CASCADE;

-- 휴가 신청 및 승인
TRUNCATE TABLE leave_requests CASCADE;
