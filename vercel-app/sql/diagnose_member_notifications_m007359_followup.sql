-- M007359: 포인트 적립은 있는데 point_line_notify 이벤트가 전무한 원인 좁히기
-- (쿼리 7 결과 후속)

-- A) LINE identity + 포인트 설정
SELECT m.id, m.member_no, m.point_balance,
       i.provider_user_id, i.status AS identity_status, i.linked_at, i.last_seen_at
FROM public.members m
LEFT JOIN public.member_identities i
  ON i.member_id = m.id AND i.provider = 'line'
WHERE upper(trim(m.member_no)) = 'M007359';

SELECT key, value_json, updated_at
FROM public.system_settings
WHERE key = 'member_point_line_notify_enabled';

-- B) 이 회원에게 point_line_notify 이벤트가 하나라도 있는지
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT count(*) AS notify_event_count
FROM public.member_events e
JOIN mm ON e.member_id = mm.id
WHERE e.event_type = 'point_line_notify'
   OR e.event_id LIKE 'point_line_notify:%';

-- C) 시스템 전체: 최근 point_line_notify 성공 여부 (기능 자체 동작 확인)
SELECT e.id, e.member_id, e.event_id, e.status, e.processed_at, e.error_message
FROM public.member_events e
WHERE e.event_type = 'point_line_notify'
   OR e.event_id LIKE 'point_line_notify:%'
ORDER BY e.processed_at DESC
LIMIT 20;

SELECT count(*) AS system_point_line_notify_total
FROM public.member_events
WHERE event_type = 'point_line_notify'
   OR event_id LIKE 'point_line_notify:%';

-- D) 샘플 주문 56094: 회원·결제·원장
SELECT o.id, o.order_no, o.store_code, o.status, o.member_id, o.point_earned, o.total,
       o.created_at, o.updated_at
FROM public.pos_orders o
WHERE o.id = 56094;

SELECT id, kind, points, order_id, created_at
FROM public.member_points_ledger
WHERE order_id = 56094;
