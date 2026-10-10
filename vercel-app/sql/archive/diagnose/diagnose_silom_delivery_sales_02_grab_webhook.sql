-- 실롬 Grab 주문 유입(웹훅) 최근 24시간 ↔ POS 주문 매칭
-- pos_order_id 가 비어 있음 → POS 저장 실패
-- store_code 가 CM Silom 이 아님 → 다른 매장으로 저장(매장코드 매핑 오류)
-- status 가 pending/cooking → POS에서 수락·포장완료 미처리
SELECT
  e.received_at AT TIME ZONE 'Asia/Bangkok' AS received_bkk,
  e.order_id AS grab_order_id,
  e.merchant_id,
  e.partner_merchant_id,
  o.id AS pos_order_id,
  o.store_code,
  o.status,
  o.total,
  substring(o.memo from 'grab_state:([A-Za-z_]+)') AS grab_state
FROM public.pos_grab_webhook_events e
LEFT JOIN LATERAL (
  SELECT p.id, p.store_code, p.status, p.total, p.memo
  FROM public.pos_orders p
  WHERE p.created_at >= now() - interval '2 days'
    AND p.memo ILIKE '%grab_order:' || e.order_id || '%'
  ORDER BY p.id DESC
  LIMIT 1
) o ON true
WHERE e.event_kind = 'submit_order'
  AND e.received_at >= now() - interval '24 hours'
  AND (e.partner_merchant_id = '1042' OR e.payload_json::text ILIKE '%silom%')
ORDER BY e.received_at DESC;
