-- 자리 대기 번호표 — Union Mall 실제 POS 매장 코드 확인 (조회만, 최근 7일 주문 기준)
-- 결과 store_code 가 pos_queue_store_codes 값과 글자까지 같아야 POS에 버튼이 보인다
SELECT
  o.store_code,
  count(*) AS orders_7d,
  max(o.created_at) AS last_order_at
FROM public.pos_orders o
WHERE o.created_at >= now() - interval '7 days'
  AND o.store_code ILIKE '%union%'
GROUP BY o.store_code
ORDER BY orders_7d DESC;
