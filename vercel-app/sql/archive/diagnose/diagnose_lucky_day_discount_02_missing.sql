-- Lucky Day 주문 중 discount_amt 가 비었거나 협업 할인액보다 작은 주문 (통합 할인 누락 후보)
-- 조회 전용(UPDATE 없음). 영업 중 실행 가능. 0행이면 누락 없음.
WITH lucky_campaigns AS (
  SELECT id FROM public.marketing_campaigns WHERE topic ILIKE '%lucky%'
)
SELECT
  o.id,
  o.order_no,
  o.store_code,
  o.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  o.status,
  o.subtotal,
  o.total,
  o.discount_amt,
  o.collab_discount_amt,
  o.discount_reason,
  o.marketing_campaign_id
FROM public.pos_orders o
WHERE o.created_at >= TIMESTAMPTZ '2026-09-09 00:00:00+07'
  AND o.created_at <  TIMESTAMPTZ '2026-10-11 00:00:00+07'
  AND o.status IN ('completed', 'paid', 'ready')
  AND (
    o.discount_reason ILIKE '%lucky%'
    OR o.marketing_campaign_id IN (SELECT id FROM lucky_campaigns)
  )
  AND (
    COALESCE(o.discount_amt, 0) <= 0
    OR COALESCE(o.discount_amt, 0) + 0.01 < COALESCE(o.collab_discount_amt, 0)
  )
ORDER BY o.created_at
LIMIT 500;
