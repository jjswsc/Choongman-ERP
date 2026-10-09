-- 더스트리트: 바닥에 남을 수 있는 열린 홀 주문 미리보기 (변경 없음)
SELECT
  o.id AS order_id,
  o.order_no,
  o.store_code,
  o.table_name,
  o.status,
  o.total,
  o.payment_qr,
  o.payment_cash,
  o.payment_card,
  o.payment_other,
  o.created_by,
  o.created_at,
  o.paid_at
FROM public.pos_orders o
WHERE o.store_code ILIKE '%the street%'
  AND lower(coalesce(o.status, '')) IN ('pending', 'cooking', 'ready', 'preparing')
  AND lower(replace(coalesce(o.order_type, 'dine_in'), '-', '_')) = 'dine_in'
ORDER BY o.table_name, o.id;
