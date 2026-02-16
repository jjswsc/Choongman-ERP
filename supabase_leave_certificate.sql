-- 병가 진단서 업로드용 컬럼 추가 (leave_requests)
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT '';
