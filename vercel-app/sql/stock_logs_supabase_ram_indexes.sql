-- stock_logs 대량 스캔·집계 시 Postgres 메모리(work_mem·해시 집계) 사용이 커질 수 있음.
-- Supabase SQL Editor에서 한 번씩 실행 (CONCURRENTLY 는 트랜잭션 밖에서 실행).
--
-- 적용 전: Dashboard → Database → Query Performance 에서
--   get_store_stock / get_distinct_stock_locations / stock_logs Seq Scan 이 상위인지 확인.

-- 1) 재고 합계 RPC get_store_stock: location + 날짜 상한 필터
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_logs_location_log_date_item
  ON stock_logs (location, log_date, item_code);

-- 2) 매장 목록 RPC get_distinct_stock_locations: location 만 DISTINCT
--    (NULL/빈 문자열은 쿼리에서 제외하므로 부분 인덱스로 크기 축소)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_logs_location_distinct
  ON stock_logs (location)
  WHERE location IS NOT NULL AND btrim(location::text) <> '';

-- ANALYZE 권장 (통계 갱신)
-- ANALYZE stock_logs;
