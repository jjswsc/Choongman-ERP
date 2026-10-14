-- Lucky Day 랜덤 할인(2026-09-09 ~ 2026-10-10, 방콕) — 매장별 집계 · 통합 할인 반영 여부
-- 조회 전용(UPDATE 없음). 영업 중 실행 가능.
-- discount_amt 합계가 통합 할인(결제 할인 층)에 들어가는 금액이다.
-- missing_discount_orders > 0 이면 그 주문은 통합 할인에서 빠졌을 수 있다.
WITH lucky_campaigns AS (
  SELECT id FROM public.marketing_campaigns WHERE topic ILIKE '%lucky%'
)
SELECT
  o.store_code,
  COUNT(*) AS orders,
  ROUND(SUM(COALESCE(o.discount_amt, 0)), 2) AS discount_amt_sum,
  ROUND(SUM(COALESCE(o.collab_discount_amt, 0)), 2) AS collab_discount_amt_sum,
  COUNT(*) FILTER (
    WHERE COALESCE(o.discount_amt, 0) + 0.01 < COALESCE(o.collab_discount_amt, 0)
       OR COALESCE(o.discount_amt, 0) <= 0
  ) AS missing_discount_orders,
  MIN(o.created_at AT TIME ZONE 'Asia/Bangkok') AS first_order_bkk,
  MAX(o.created_at AT TIME ZONE 'Asia/Bangkok') AS last_order_bkk
FROM public.pos_orders o
WHERE o.created_at >= TIMESTAMPTZ '2026-09-09 00:00:00+07'
  AND o.created_at <  TIMESTAMPTZ '2026-10-11 00:00:00+07'
  AND o.status IN ('completed', 'paid', 'ready')
  AND (
    o.discount_reason ILIKE '%lucky%'
    OR o.marketing_campaign_id IN (SELECT id FROM lucky_campaigns)
  )
GROUP BY o.store_code
ORDER BY discount_amt_sum DESC;
