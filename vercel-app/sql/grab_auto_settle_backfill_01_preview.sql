-- 미리보기: Grab에서 픽업·배달 완료(COLLECTED/DELIVERED)됐는데 POS에서 결제 마감 안 된 주문 (최근 3일)
-- 이 주문들은 ERP 매출에 빠져 있다. 매장별 건수·금액만 확인한다(변경 없음).
SELECT
  o.store_code,
  COUNT(*) AS orders,
  SUM(o.total) AS total_amt,
  MIN(o.created_at AT TIME ZONE 'Asia/Bangkok') AS first_bkk,
  MAX(o.created_at AT TIME ZONE 'Asia/Bangkok') AS last_bkk
FROM public.pos_orders o
WHERE o.created_at >= now() - interval '3 days'
  AND o.status IN ('pending', 'cooking', 'preparing', 'ready')
  AND o.memo ~* 'grab_state:(COLLECTED|DELIVERED)'
GROUP BY 1
ORDER BY 2 DESC;
