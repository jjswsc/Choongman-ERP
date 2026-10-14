-- 자리 대기 번호표 — 설정·오늘 발급 현황 확인 (조회만)
SELECT
  s.key,
  s.value_json,
  (SELECT count(*) FROM public.pos_queue_tickets t
    WHERE t.business_ymd = to_char(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD')) AS today_ticket_count,
  to_regprocedure('public.allocate_pos_queue_no(text,text)') IS NOT NULL AS rpc_ready
FROM public.system_settings s
WHERE s.key IN ('pos_queue_store_codes', 'pos_queue_all_stores', 'pos_queue_line_notify_enabled')
ORDER BY s.key;
