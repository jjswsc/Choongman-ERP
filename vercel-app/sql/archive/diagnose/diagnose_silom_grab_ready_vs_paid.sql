-- 실롬 Grab 주문: POS에서 'แพ็คเสร็จ(포장 완료→ready)'를 누른 시각 vs 결제 시각 (최근 3일, 방콕시간)
-- ready_pressed_bkk 가 있으면 그 순간 POS가 Grab에 "พร้อมส่ง"을 보낸 것. 없으면 Grab 쪽 자동 처리.
SELECT
  o.id,
  o.order_no,
  substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
  o.status,
  o.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  r.ready_at AT TIME ZONE 'Asia/Bangkok' AS ready_pressed_bkk,
  r.ready_by,
  o.paid_at AT TIME ZONE 'Asia/Bangkok' AS paid_bkk,
  round(extract(epoch FROM (o.paid_at - r.ready_at)))::int AS paid_minus_ready_sec
FROM public.pos_orders o
LEFT JOIN LATERAL (
  SELECT e.event_at AS ready_at, e.actor_name AS ready_by
  FROM public.pos_order_events e
  WHERE e.order_id = o.id
    AND e.after_json->>'status' = 'ready'
  ORDER BY e.event_at
  LIMIT 1
) r ON true
WHERE o.store_code ILIKE '%silom%'
  AND o.memo ILIKE '%grab_order:%'
  AND o.created_at >= now() - interval '3 days'
ORDER BY o.created_at DESC;
