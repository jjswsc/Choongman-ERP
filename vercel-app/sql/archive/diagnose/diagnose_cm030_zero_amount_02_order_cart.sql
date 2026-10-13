-- 2/3 주문 2183 장바구니(cart_json)의 CM030 단가 vs 현재 품목 마스터 단가
-- 수령 처리 시 cart price가 stock_logs.invoice_unit_price로 복사된다.
-- cart_price = 0 이면 주문 시점에 단가가 0으로 담긴 것. SELECT only.

SELECT
  o.id AS order_id,
  o.store_name,
  o.order_date,
  line->>'code' AS code,
  line->>'name' AS name,
  line->>'qty' AS cart_qty,
  line->>'price' AS cart_price,
  i.price AS master_price_now,
  i.vendor AS item_vendor
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(o.cart_json::jsonb) AS line
LEFT JOIN public.items i ON btrim(i.code) = btrim(line->>'code')
WHERE o.id = 2183
  AND upper(btrim(coalesce(line->>'code', ''))) = 'CM030';
