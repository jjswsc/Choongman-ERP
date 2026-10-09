-- SQL 적용 기록부 — 2/2: 최근 적용 내역 조회 (읽기 전용)

SELECT file_name, last_applied_at AT TIME ZONE 'Asia/Bangkok' AS last_applied_bkk, run_count, note
FROM public.sql_applied_log
ORDER BY last_applied_at DESC
LIMIT 100;
