-- 오늘(방콕) Seacon 승인 주문 + Order 미수 금액
-- 취소 시 deleting = Order 미수 합 → current - deleting < 0 이면 차단

SELECT
  o.id AS order_id,
  o.order_date,
  o.status,
  o.delivery_status,
  round(coalesce(rt.amount, 0)::numeric, 2) AS order_receivable,
  (
    SELECT count(*)::int
    FROM public.stock_logs s
    WHERE s.order_id = o.id
      AND s.log_type = 'Outbound'
      AND coalesce(s.is_deleted, false) = false
  ) AS active_outbound_logs
FROM public.orders o
LEFT JOIN public.receivable_transactions rt
  ON rt.ref_type = 'Order'
 AND rt.ref_id = o.id
WHERE o.store_name IN ('CM Seacon Srinakarin', 'Seacon Srinakarin')
  AND left(trim(o.order_date::text), 10) = to_char((now() AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD')
ORDER BY o.id DESC;
