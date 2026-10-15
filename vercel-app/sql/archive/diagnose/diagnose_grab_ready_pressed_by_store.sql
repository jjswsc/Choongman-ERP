-- 매장별 Grab 주문 중 'แพ็คเสร็จ(ready)'를 누른 비율·누른 직원·결제까지 걸린 시간 (최근 7일)
-- ready 직후(60초 이내) 결제한 건수가 많을수록 "결제하니 Grab이 พร้อมส่ง 됐다"고 느끼기 쉬움
WITH grab_orders AS (
  SELECT o.id, o.store_code, o.paid_at
  FROM public.pos_orders o
  WHERE o.memo ILIKE '%grab_order:%'
    AND o.created_at >= now() - interval '7 days'
),
ready_events AS (
  SELECT DISTINCT ON (e.order_id) e.order_id, e.event_at, e.actor_name
  FROM public.pos_order_events e
  JOIN grab_orders g ON g.id = e.order_id
  WHERE e.after_json->>'status' = 'ready'
  ORDER BY e.order_id, e.event_at
)
SELECT
  g.store_code,
  count(*) AS grab_orders,
  count(r.order_id) AS ready_pressed,
  round(100.0 * count(r.order_id) / nullif(count(*), 0), 1) AS ready_pressed_pct,
  count(*) FILTER (WHERE g.paid_at - r.event_at BETWEEN interval '0' AND interval '60 seconds') AS paid_within_60s_after_ready,
  string_agg(DISTINCT r.actor_name, ', ') AS pressed_by
FROM grab_orders g
LEFT JOIN ready_events r ON r.order_id = g.id
GROUP BY g.store_code
ORDER BY ready_pressed DESC, grab_orders DESC;
