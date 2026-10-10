-- 실롬 배달 주문: 결제(마감) 처리 시각 분포 — 직원이 언제 마지막으로 마감했는지
-- 주문 생성 시각(created) vs 실제 마감 시각(paid_at)을 10분 단위로 본다.
SELECT
  date_trunc('hour', paid_at AT TIME ZONE 'Asia/Bangkok')
    + floor(extract(minute FROM paid_at AT TIME ZONE 'Asia/Bangkok') / 10) * interval '10 minutes' AS paid_10min_bkk,
  COUNT(*) AS orders,
  MIN(created_at AT TIME ZONE 'Asia/Bangkok') AS oldest_created_bkk,
  MAX(created_at AT TIME ZONE 'Asia/Bangkok') AS newest_created_bkk,
  SUM(total) AS total_amt
FROM public.pos_orders
WHERE created_at >= now() - interval '24 hours'
  AND store_code = 'CM Silom'
  AND COALESCE(delivery_app_code, '') <> ''
  AND paid_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;
