-- 2/3 미리보기: Siam Food Services 품목(CM030, SS009) 수령분 중 본사 출고 로그가 빠진 줄 → 3/3에서 보충될 행
-- 대상: 9/20 이후 승인·수령완료 주문, 해당 cart 줄이 received_indices 에 포함, 같은 주문에 다른 품목 본사 출고 로그가 있음.
-- log_date·vendor_target 은 같은 주문 다른 품목의 본사 출고 로그(같은 수령 처리에서 생성)에서 가져온다. SELECT only.

WITH lines AS (
  SELECT
    o.id AS order_id,
    upper(btrim(line.val->>'code')) AS code,
    (line.ord - 1) AS idx,
    line.val,
    nullif(btrim(o.received_qty_json::text), '') AS rq
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.cart_json::jsonb) WITH ORDINALITY AS line(val, ord)
  WHERE o.status = 'Approved'
    AND o.order_date >= '2026-09-20'
    AND o.delivery_status IN ('배송완료', '일부배송완료')
    AND upper(btrim(coalesce(line.val->>'code', ''))) IN ('CM030', 'SS009')
    AND nullif(btrim(o.received_indices::text), '')::jsonb @> to_jsonb((line.ord - 1)::int)
),
sib AS (
  SELECT DISTINCT ON (sl.order_id) sl.order_id, sl.log_date, sl.vendor_target
  FROM public.stock_logs sl
  WHERE sl.order_id IN (SELECT order_id FROM lines)
    AND sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
  ORDER BY sl.order_id, sl.id
)
SELECT
  l.order_id,
  l.code,
  s.vendor_target,
  s.log_date AT TIME ZONE 'Asia/Bangkok' AS log_date_bkk,
  abs(coalesce(l.rq::jsonb->>l.idx::text, l.val->>'qty')::numeric) AS qty,
  (l.val->>'price')::numeric AS unit_price,
  abs(coalesce(l.rq::jsonb->>l.idx::text, l.val->>'qty')::numeric) * (l.val->>'price')::numeric AS amount
FROM lines l
JOIN sib s ON s.order_id = l.order_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stock_logs x
  WHERE x.order_id = l.order_id
    AND x.log_type = 'Outbound'
    AND upper(btrim(coalesce(x.item_code, ''))) = l.code
    AND coalesce(x.is_deleted, false) = false
)
ORDER BY l.code, s.log_date, l.order_id;
