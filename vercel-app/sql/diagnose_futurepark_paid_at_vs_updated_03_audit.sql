-- 1/1 조회만 — Future Park 25→26 paid_at 10건: 감사로그로 결제 기록 시각·소스 확인
-- SELECT만. 데이터 변경 없음.
-- change_source = offline_queue 이면 오프라인 동기화 시점에 paid_at 이 찍힌 것

SELECT
  a.order_no,
  a.changed_at AT TIME ZONE 'Asia/Bangkok' AS changed_bkk,
  a.action_type,
  a.change_source,
  a.reason,
  a.changed_by,
  a.before_json ->> 'paid_at' AS before_paid_at,
  a.after_json ->> 'paid_at' AS after_paid_at,
  a.before_json ->> 'payment_qr' AS before_qr,
  a.after_json ->> 'payment_qr' AS after_qr,
  a.before_json ->> 'payment_cash' AS before_cash,
  a.after_json ->> 'payment_cash' AS after_cash,
  a.before_json ->> 'payment_card' AS before_card,
  a.after_json ->> 'payment_card' AS after_card
FROM public.pos_order_audit_logs a
WHERE a.order_no IN (
  'CMFUTUREPARK-20261025-067',
  'CMFUTUREPARK-20261025-064',
  'CMFUTUREPARK-20261025-061',
  'CMFUTUREPARK-20261025-070',
  'CMFUTUREPARK-20261025-057',
  'CMFUTUREPARK-20261025-066',
  'CMFUTUREPARK-20261025-073',
  'CMFUTUREPARK-20261025-022',
  'CMFUTUREPARK-20261025-054',
  'CMFUTUREPARK-20261025-060'
)
ORDER BY a.order_no, a.changed_at;
