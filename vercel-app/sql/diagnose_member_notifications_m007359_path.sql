-- 시스템 전체 point_line_notify 2건 내용 + M007359 7/23 적립이 어떤 경로인지
SELECT e.id, e.member_id, m.member_no, e.event_id, e.status, e.payload, e.processed_at, e.error_message
FROM public.member_events e
LEFT JOIN public.members m ON m.id = e.member_id
WHERE e.event_type = 'point_line_notify'
   OR e.event_id LIKE 'point_line_notify:%'
ORDER BY e.processed_at DESC
LIMIT 20;

-- 7/23 연속 7.77 주문 샘플: created_by / order_type / paid 경로 추정
SELECT id, order_no, store_code, status, order_type, created_by,
       member_id, point_earned, total, paid_at, created_at
FROM public.pos_orders
WHERE id IN (56094, 56092, 56091, 56087, 56041)
ORDER BY id;
