-- attendance_logs에 ot_min, early_min 컬럼이 없을 때만 추가
-- (예전 스키마로 만든 DB에서 연장/조퇴 조정 저장이 안 될 때 실행)
-- 실행: Supabase SQL Editor에서 이 파일 내용 붙여넣기 후 Run

ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS early_min NUMERIC(12,2) DEFAULT 0;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS ot_min NUMERIC(12,2) DEFAULT 0;
