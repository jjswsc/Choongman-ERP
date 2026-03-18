# Disk I/O 최적화 가이드

Supabase Disk IO Budget 소진 시 적용한 최적화 요약 (2026-03)

## 1. DB 인덱스 (supabase_performance_indexes.sql)

루트의 `supabase_performance_indexes.sql`을 Supabase SQL Editor에서 실행:

| 인덱스 | 테이블 | 목적 |
|--------|--------|------|
| idx_stock_logs_log_type_log_date | stock_logs | getMyUsageHistory (log_type=Usage, log_date DESC) |
| idx_stock_logs_location_log_type_date | stock_logs | location+log_type+log_date 복합 조회 |
| idx_attendance_logs_store_name_log_at | attendance_logs | getAttendanceList, getTodayAttendanceTypes |
| idx_attendance_logs_log_at_store | attendance_logs | log_at 범위 + store 필터 |

## 2. getAppData 캐시 (2분 TTL)

- `lib/api-client.ts`: 메모리 캐시, storeName+asOfDate+scope별 2분 유효
- 재고 변경 API(adjustStock, processOrder, processUsage, processOrderReceive, processOrderDecision) 성공 시 자동 무효화

## 3. POS refetchStores 디바운스 (600ms)

- `lib/pos-store.ts`: 연속 호출 시 600ms 디바운스로 API 호출 축소

## 4. 권장 사항 (수동)

- **Supabase 대시보드 사용 최소화**: Table Editor, SQL Editor 사용 시 내부 쿼리가 Disk I/O의 상당 비중 차지 → 개발/디버깅 시에만 사용
- **get_store_stock RPC**: RPC가 배포되어 있는지 확인. 미배포 시 fallback이 stock_logs 50,000 limit 스캔
