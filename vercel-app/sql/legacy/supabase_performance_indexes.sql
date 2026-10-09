-- Disk I/O 최적화: Query Performance 분석 기반 복합 인덱스
-- 적용: Supabase SQL Editor에서 실행
-- ref: limit-audit-report.md, Supabase Query Performance CSV 분석

-- 1. stock_logs: getMyUsageHistory (location ilike, log_type=Usage, order log_date desc)
--    log_type 필터 후 log_date 역순 정렬에 유리
CREATE INDEX IF NOT EXISTS idx_stock_logs_log_type_log_date
  ON stock_logs(log_type, log_date DESC);

-- 2. stock_logs: location + log_type + log_date 조합 쿼리 (getAppData fallback, getCombinedOutboundHistory 등)
CREATE INDEX IF NOT EXISTS idx_stock_logs_location_log_type_date
  ON stock_logs(location, log_type, log_date DESC);

-- 3. attendance_logs: getAttendanceList, getTodayAttendanceTypes (store_name, name, log_at)
--    복합 조건 조회 및 log_at 범위/정렬에 유리
CREATE INDEX IF NOT EXISTS idx_attendance_logs_store_name_log_at
  ON attendance_logs(store_name, name, log_at);

-- 4. attendance_logs: getTodayAttendanceSummary, getPayrollPreview (log_at 범위 필터)
--    기존 idx_attendance_logs_log_at 있음. log_at + store_name 복합으로 store 필터 시 성능 보강
CREATE INDEX IF NOT EXISTS idx_attendance_logs_log_at_store
  ON attendance_logs(log_at, store_name);

-- 5. notices: idx_notices_created_at 이미 supabase_schema에 존재 (ORDER BY created_at DESC 지원)
