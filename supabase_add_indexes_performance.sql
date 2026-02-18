-- Query Performance 최적화용 인덱스 추가
-- attendance_logs: 115,081 calls, 33.8% - store_name, name, log_at 범위 조회
-- leave_requests: 40,606 calls - store, name, leave_date 조회
-- employees: (store, name) 로그인 조회 - UNIQUE로 이미 커버됨

-- attendance_logs: store_name + name + log_at 복합 인덱스 (근태 조회 패턴)
-- WHERE store_name ilike X AND name ilike Y AND log_at >= A AND log_at < B ORDER BY log_at ASC
-- text_pattern_ops: ilike/LIKE 패턴 매칭 시 인덱스 활용 (앞쪽 와일드카드 없을 때)
CREATE INDEX IF NOT EXISTS idx_attendance_logs_store_name_log_at
  ON attendance_logs (store_name text_pattern_ops, name text_pattern_ops, log_at);

-- leave_requests: store + name + leave_date 복합 인덱스 (휴가 조회 패턴)
-- WHERE store ilike X AND name ilike Y ORDER BY leave_date DESC
CREATE INDEX IF NOT EXISTS idx_leave_requests_store_name_date
  ON leave_requests (store text_pattern_ops, name text_pattern_ops, leave_date DESC);

-- stock_logs: location + log_date (location 필터 후 날짜순 정렬 시 활용)
CREATE INDEX IF NOT EXISTS idx_stock_logs_location_log_date
  ON stock_logs (location, log_date DESC);
