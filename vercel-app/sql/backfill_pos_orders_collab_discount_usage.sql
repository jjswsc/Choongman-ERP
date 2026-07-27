-- =============================================================================
-- 과거 POS 협업 할인 backfill
-- discount_reason 문구 → marketing_campaigns.topic 매칭으로
--   pos_orders.marketing_campaign_id / collab_discount_amt 채움
-- 선행: pos_orders_collab_discount_amt.sql (컬럼·인덱스)
-- Supabase SQL Editor에서 1) 미리보기 → 2) UPDATE → 3) 검증 순으로 실행
--
-- ⚠ 주의: UPDATE는 Realtime으로 전 매장 POS에 전달됩니다.
--   POS 메인 단말이 켜진 상태에서 실행하면 결제 영수증이 대량 재인쇄될 수 있습니다.
--   가능하면 심야·POS 종료 후 실행하거나, 결제 영수증 자동인쇄 가드 배포 이후에 실행하세요.
-- =============================================================================

-- 컬럼 보장 (이미 있으면 무해)
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS collab_discount_amt numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT NULL;

-- ---------------------------------------------------------------------------
-- 1) 미리보기 (UPDATE 전 반드시 확인)
--    협업 사유가 있는데 ID가 비어 있는 주문 → 추정 캠페인·금액
-- ---------------------------------------------------------------------------
WITH collab_orders AS (
  SELECT
    o.id,
    o.order_no,
    o.store_code,
    o.created_at,
    o.discount_reason,
    o.discount_amt,
    o.coupon_discount_amt,
    o.tier_discount_amt,
    GREATEST(
      0::numeric,
      ROUND(
        (
          COALESCE(o.discount_amt, 0)
          - COALESCE(o.coupon_discount_amt, 0)
          - COALESCE(o.tier_discount_amt, 0)
        )::numeric,
        2
      )
    ) AS estimated_collab_amt
  FROM public.pos_orders o
  WHERE o.marketing_campaign_id IS NULL
    AND COALESCE(o.collab_discount_amt, 0) = 0
    AND COALESCE(o.discount_amt, 0) > 0
    AND COALESCE(o.discount_reason, '') <> ''
    AND (
      o.discount_reason ILIKE '%collab%'
      OR o.discount_reason ILIKE '%collaboration%'
      OR o.discount_reason ILIKE '%협업%'
      OR o.discount_reason ILIKE '%ความร่วมมือ%'
      OR o.discount_reason ILIKE '%ส่วนลดความร่วมมือ%'
    )
),
matched AS (
  SELECT DISTINCT ON (co.id)
    co.id AS order_id,
    co.order_no,
    co.store_code,
    co.created_at,
    co.discount_reason,
    co.estimated_collab_amt,
    c.id AS campaign_id,
    c.campaign_no,
    c.topic,
    c.collab_management
  FROM collab_orders co
  INNER JOIN public.marketing_campaigns c
    ON length(btrim(COALESCE(c.topic, ''))) >= 3
   AND co.discount_reason ILIKE ('%' || btrim(c.topic) || '%')
  WHERE co.estimated_collab_amt > 0
  ORDER BY
    co.id,
    (COALESCE(c.collab_management, false) = true) DESC,
    length(btrim(c.topic)) DESC,
    c.id DESC
)
SELECT
  order_id,
  order_no,
  store_code,
  created_at,
  campaign_id,
  campaign_no,
  topic,
  collab_management,
  estimated_collab_amt,
  left(discount_reason, 160) AS discount_reason_preview
FROM matched
ORDER BY created_at DESC
LIMIT 500;

-- 미리보기 건수 요약
WITH collab_orders AS (
  SELECT
    o.id,
    GREATEST(
      0::numeric,
      ROUND(
        (
          COALESCE(o.discount_amt, 0)
          - COALESCE(o.coupon_discount_amt, 0)
          - COALESCE(o.tier_discount_amt, 0)
        )::numeric,
        2
      )
    ) AS estimated_collab_amt,
    o.discount_reason
  FROM public.pos_orders o
  WHERE o.marketing_campaign_id IS NULL
    AND COALESCE(o.collab_discount_amt, 0) = 0
    AND COALESCE(o.discount_amt, 0) > 0
    AND COALESCE(o.discount_reason, '') <> ''
    AND (
      o.discount_reason ILIKE '%collab%'
      OR o.discount_reason ILIKE '%collaboration%'
      OR o.discount_reason ILIKE '%협업%'
      OR o.discount_reason ILIKE '%ความร่วมมือ%'
      OR o.discount_reason ILIKE '%ส่วนลดความร่วมมือ%'
    )
),
matched AS (
  SELECT DISTINCT ON (co.id) co.id
  FROM collab_orders co
  INNER JOIN public.marketing_campaigns c
    ON length(btrim(COALESCE(c.topic, ''))) >= 3
   AND co.discount_reason ILIKE ('%' || btrim(c.topic) || '%')
  WHERE co.estimated_collab_amt > 0
  ORDER BY
    co.id,
    (COALESCE(c.collab_management, false) = true) DESC,
    length(btrim(c.topic)) DESC,
    c.id DESC
)
SELECT
  (SELECT COUNT(*) FROM collab_orders) AS collab_reason_orders,
  (SELECT COUNT(*) FROM matched) AS matched_orders,
  (SELECT COUNT(*) FROM collab_orders) - (SELECT COUNT(*) FROM matched) AS unmatched_orders;

-- ---------------------------------------------------------------------------
-- 2) 실제 backfill (미리보기 확인 후 실행)
-- ---------------------------------------------------------------------------
WITH collab_orders AS (
  SELECT
    o.id,
    GREATEST(
      0::numeric,
      ROUND(
        (
          COALESCE(o.discount_amt, 0)
          - COALESCE(o.coupon_discount_amt, 0)
          - COALESCE(o.tier_discount_amt, 0)
        )::numeric,
        2
      )
    ) AS estimated_collab_amt,
    o.discount_reason
  FROM public.pos_orders o
  WHERE o.marketing_campaign_id IS NULL
    AND COALESCE(o.collab_discount_amt, 0) = 0
    AND COALESCE(o.discount_amt, 0) > 0
    AND COALESCE(o.discount_reason, '') <> ''
    AND (
      o.discount_reason ILIKE '%collab%'
      OR o.discount_reason ILIKE '%collaboration%'
      OR o.discount_reason ILIKE '%협업%'
      OR o.discount_reason ILIKE '%ความร่วมมือ%'
      OR o.discount_reason ILIKE '%ส่วนลดความร่วมมือ%'
    )
),
matched AS (
  SELECT DISTINCT ON (co.id)
    co.id AS order_id,
    c.id AS campaign_id,
    co.estimated_collab_amt
  FROM collab_orders co
  INNER JOIN public.marketing_campaigns c
    ON length(btrim(COALESCE(c.topic, ''))) >= 3
   AND co.discount_reason ILIKE ('%' || btrim(c.topic) || '%')
  WHERE co.estimated_collab_amt > 0
  ORDER BY
    co.id,
    (COALESCE(c.collab_management, false) = true) DESC,
    length(btrim(c.topic)) DESC,
    c.id DESC
)
UPDATE public.pos_orders o
SET
  marketing_campaign_id = m.campaign_id,
  collab_discount_amt = m.estimated_collab_amt
FROM matched m
WHERE o.id = m.order_id
  AND o.marketing_campaign_id IS NULL
  AND COALESCE(o.collab_discount_amt, 0) = 0;

-- ---------------------------------------------------------------------------
-- 3) 검증
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*) FILTER (
    WHERE marketing_campaign_id IS NOT NULL AND collab_discount_amt > 0
  ) AS linked_collab_orders,
  ROUND(
    SUM(collab_discount_amt) FILTER (
      WHERE marketing_campaign_id IS NOT NULL AND collab_discount_amt > 0
    )::numeric,
    2
  ) AS linked_collab_discount_sum
FROM public.pos_orders;

-- 아직 사유만 있고 ID 없는 잔여 (캠페인명 변경·매칭 실패)
SELECT
  COUNT(*) AS still_unmatched
FROM public.pos_orders o
WHERE o.marketing_campaign_id IS NULL
  AND COALESCE(o.collab_discount_amt, 0) = 0
  AND COALESCE(o.discount_amt, 0) > 0
  AND (
    o.discount_reason ILIKE '%collab%'
    OR o.discount_reason ILIKE '%collaboration%'
    OR o.discount_reason ILIKE '%협업%'
    OR o.discount_reason ILIKE '%ความร่วมมือ%'
    OR o.discount_reason ILIKE '%ส่วนลดความร่วมมือ%'
  );
