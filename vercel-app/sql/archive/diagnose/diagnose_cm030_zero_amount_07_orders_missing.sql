-- 7/7 9/20 이후 CM030이 담긴 승인 주문 + 본사 출고 로그(청구 근거) 유무
-- hq_outbound_cm030 = 0 이고 delivery_status 가 수령완료 계열이면 미청구.
-- 매장 입고 로그에 order_id 가 비어 있는 기간이 있어 주문(orders) 기준으로 본다. SELECT only.

SELECT
  o.id AS order_id,
  o.store_name,
  o.order_date,
  o.delivery_date,
  o.delivery_status,
  (line.ord - 1) AS cart_idx,
  line.val->>'qty' AS cart_qty,
  line.val->>'price' AS cart_price,
  o.received_indices,
  (
    SELECT count(*)
    FROM public.stock_logs sl
    WHERE sl.order_id = o.id
      AND sl.log_type = 'Outbound'
      AND upper(btrim(coalesce(sl.item_code, ''))) = 'CM030'
      AND coalesce(sl.is_deleted, false) = false
  ) AS hq_outbound_cm030,
  (
    SELECT count(*)
    FROM public.stock_logs sl
    WHERE sl.order_id = o.id
      AND sl.log_type = 'Outbound'
      AND coalesce(sl.is_deleted, false) = false
  ) AS hq_outbound_all_items
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(o.cart_json::jsonb) WITH ORDINALITY AS line(val, ord)
WHERE o.status = 'Approved'
  AND o.order_date >= '2026-09-20'
  AND upper(btrim(coalesce(line.val->>'code', ''))) = 'CM030'
ORDER BY o.order_date DESC, o.id DESC;
