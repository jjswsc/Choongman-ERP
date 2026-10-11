-- 확인(변경 없음): 에까마이 GF-513(Grab ID …LWTVEVJE) 주문의 상태·결제 변경 이력
-- source = grab_webhook / reason = grab_state:COLLECTED 이면 Grab 픽업 자동마감이 현금으로 닫은 것
SELECT
  e.event_at AT TIME ZONE 'Asia/Bangkok' AS at_bkk,
  e.order_no,
  e.event_type,
  e.source,
  e.actor_name,
  e.reason,
  e.before_json,
  e.after_json
FROM public.pos_order_events e
WHERE e.order_id IN (
  SELECT o.id
  FROM public.pos_orders o
  WHERE o.table_name ILIKE '%LWTVEVJE%'
    AND o.created_at >= now() - interval '3 days'
)
ORDER BY e.event_at;
