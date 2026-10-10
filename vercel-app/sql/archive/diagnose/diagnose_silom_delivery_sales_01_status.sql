-- 실롬 매장 최근 24시간 주문: 매장코드·채널·상태별 건수/금액
-- ERP 매출은 status IN ('completed','paid','ready')만 집계한다.
-- pending(수락 대기)·cooking(조리 중)으로 남은 배달 주문은 매출에 안 잡힌다.
SELECT
  store_code,
  COALESCE(NULLIF(delivery_app_code, ''), order_type, '(none)') AS channel,
  status,
  COUNT(*) AS orders,
  SUM(total) AS total_amt,
  MIN(created_at AT TIME ZONE 'Asia/Bangkok') AS first_bkk,
  MAX(created_at AT TIME ZONE 'Asia/Bangkok') AS last_bkk
FROM public.pos_orders
WHERE created_at >= now() - interval '24 hours'
  AND (store_code ILIKE '%silom%' OR store_code = '1042')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
