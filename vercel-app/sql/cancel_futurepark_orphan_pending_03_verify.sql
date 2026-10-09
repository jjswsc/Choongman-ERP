-- 3/3 검증 — 두 주문이 cancelled 인지 확인
-- 이것만 복사 → Run.

SELECT
  id,
  order_no,
  store_code,
  table_name,
  status,
  total,
  created_at,
  memo
FROM public.pos_orders
WHERE order_no IN (
  'CMFUTUREPARK-20260916-002',
  'CMFUTUREPARK-20260916-003'
)
ORDER BY order_no;
