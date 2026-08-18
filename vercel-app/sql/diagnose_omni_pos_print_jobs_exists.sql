-- Omni: QR 주방 큐 테이블이 있는지 확인. 결과 NULL 이면 pos_print_jobs.sql 을 실행하세요.
SELECT to_regclass('public.pos_print_jobs') AS pos_print_jobs;
