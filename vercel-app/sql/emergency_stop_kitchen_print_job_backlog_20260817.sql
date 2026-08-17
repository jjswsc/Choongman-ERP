-- 긴급: 주방 인쇄 폭주 중지 (2026-08-17)
-- 원인: 11:06 배포 후 메인 POS가 예전부터 쌓인 pos_print_jobs(queued)를 오래된 것부터 연속 인쇄.
-- 지금 실행하세요. pos_orders 는 건드리지 않습니다.
-- 이미 인쇄 중인 몇 장은 나올 수 있습니다. 매장에서는 주방 프린터 전원을 먼저 끄세요.

-- 미리보기
SELECT status, count(*) AS n, min(created_at) AS oldest, max(created_at) AS newest
FROM public.pos_print_jobs
WHERE job_type = 'kitchen'
GROUP BY status
ORDER BY n DESC;

SELECT store_code, status, count(*) AS n
FROM public.pos_print_jobs
WHERE job_type = 'kitchen'
  AND status IN ('queued', 'claimed')
GROUP BY store_code, status
ORDER BY n DESC;

-- 대기·점유 중인 주방 잡 전부 취소 (백로그 배수 중지)
UPDATE public.pos_print_jobs
SET
  status = 'cancelled',
  last_error = 'emergency_stop_kitchen_backlog_2026-08-17',
  failed_at = now()
WHERE job_type = 'kitchen'
  AND status IN ('queued', 'claimed');
