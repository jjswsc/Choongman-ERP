-- =============================================================================
-- PAY_CORRECT 비율 스케일로 부풀려진 할인액 복구
--
-- 원인: correctPosOrderPayment 가 total 변경 시 discount/subtotal 을 (new/old) 비율로
--       곱함 → total 1→230 이면 할인액이 ~230배 폭증 (예: 458 → 105,340)
-- 증상: 협업 사용현황에 직원할인 합계가 비정상적으로 큼
--
-- 복구: items_json 에서 메뉴 소계를 다시 계산하고,
--       discount_amt = max(0, items_subtotal + fees - coupon - total)
--       collab_discount_amt 도 같은 한도로 캡
--
-- ⚠ 영업 중·POS 켜진 상태 실행 금지 (pos_orders UPDATE → Realtime).
--   심야·매장 마감 후 실행. 결제 영수증 자동인쇄 가드가 있어도 안전하게 심야 권장.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 미리보기 — 할인액이 메뉴 소계보다 큰 주문 (깨진 후보)
-- ---------------------------------------------------------------------------
WITH line_sub AS (
  SELECT
    o.id,
    ROUND(SUM(
      GREATEST(COALESCE((e->>'price')::numeric, 0), 0)
      * GREATEST(
          COALESCE((e->>'qty')::numeric, (e->>'quantity')::numeric, 1),
          0
        )
    ), 2) AS items_subtotal
  FROM public.pos_orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN o.items_json IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END
  ) e
  WHERE COALESCE(e->>'cancelledAt', e->>'cancelled_at', '') = ''
  GROUP BY o.id
)
SELECT
  o.id,
  o.order_no,
  o.store_code,
  o.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  o.subtotal AS db_subtotal,
  ls.items_subtotal,
  o.total,
  o.discount_amt,
  o.collab_discount_amt,
  o.coupon_discount_amt,
  o.tier_discount_amt,
  o.delivery_fee,
  o.packaging_fee,
  ROUND(
    GREATEST(
      0::numeric,
      COALESCE(ls.items_subtotal, 0)
        + COALESCE(o.delivery_fee, 0)
        + COALESCE(o.packaging_fee, 0)
        - COALESCE(o.coupon_discount_amt, 0)
        - COALESCE(o.total, 0)
    ),
    2
  ) AS fixed_discount_amt,
  LEFT(COALESCE(o.memo, ''), 120) AS memo_head
FROM public.pos_orders o
JOIN line_sub ls ON ls.id = o.id
WHERE COALESCE(o.discount_amt, 0) > COALESCE(ls.items_subtotal, 0) + 1
   OR (
     COALESCE(o.collab_discount_amt, 0) > 0
     AND COALESCE(o.collab_discount_amt, 0) > COALESCE(ls.items_subtotal, 0) + 1
   )
   OR (
     COALESCE(o.subtotal, 0) > COALESCE(ls.items_subtotal, 0) * 2
     AND COALESCE(ls.items_subtotal, 0) > 0
   )
ORDER BY o.discount_amt DESC NULLS LAST
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 2) UPDATE (미리보기 확인 후 주석 해제)
--    Seacon 7/23 포함, 전 매장 동일 패턴 일괄 복구
-- ---------------------------------------------------------------------------
/*
BEGIN;

WITH line_sub AS (
  SELECT
    o.id,
    ROUND(SUM(
      GREATEST(COALESCE((e->>'price')::numeric, 0), 0)
      * GREATEST(
          COALESCE((e->>'qty')::numeric, (e->>'quantity')::numeric, 1),
          0
        )
    ), 2) AS items_subtotal
  FROM public.pos_orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN o.items_json IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END
  ) e
  WHERE COALESCE(e->>'cancelledAt', e->>'cancelled_at', '') = ''
  GROUP BY o.id
),
targets AS (
  SELECT
    o.id,
    ls.items_subtotal,
    ROUND(
      GREATEST(
        0::numeric,
        COALESCE(ls.items_subtotal, 0)
          + COALESCE(o.delivery_fee, 0)
          + COALESCE(o.packaging_fee, 0)
          - COALESCE(o.coupon_discount_amt, 0)
          - COALESCE(o.total, 0)
      ),
      2
    ) AS fixed_discount_amt,
    COALESCE(o.collab_discount_amt, 0) AS prev_collab,
    COALESCE(o.tier_discount_amt, 0) AS prev_tier,
    COALESCE(o.coupon_discount_amt, 0) AS coupon_amt,
    COALESCE(o.marketing_campaign_id, NULL) AS campaign_id
  FROM public.pos_orders o
  JOIN line_sub ls ON ls.id = o.id
  WHERE COALESCE(ls.items_subtotal, 0) > 0
    AND (
      COALESCE(o.discount_amt, 0) > ls.items_subtotal + 1
      OR (
        COALESCE(o.collab_discount_amt, 0) > 0
        AND COALESCE(o.collab_discount_amt, 0) > ls.items_subtotal + 1
      )
      OR (
        COALESCE(o.subtotal, 0) > ls.items_subtotal * 2
      )
    )
)
UPDATE public.pos_orders o
SET
  subtotal = t.items_subtotal,
  discount_amt = t.fixed_discount_amt,
  vat = GREATEST(
    0::numeric,
    ROUND(
      COALESCE(o.total, 0)
        - (
          t.items_subtotal
          - t.fixed_discount_amt
          + COALESCE(o.delivery_fee, 0)
          + COALESCE(o.packaging_fee, 0)
          - t.coupon_amt
        ),
      2
    )
  ),
  collab_discount_amt = CASE
    WHEN t.campaign_id IS NOT NULL AND t.prev_collab > 0
      THEN LEAST(
        t.prev_collab,
        GREATEST(0::numeric, t.fixed_discount_amt - t.coupon_amt - LEAST(t.prev_tier, t.fixed_discount_amt))
      )
    WHEN t.prev_collab > t.items_subtotal + 1
      THEN LEAST(t.prev_collab, t.fixed_discount_amt)
    ELSE o.collab_discount_amt
  END,
  tier_discount_amt = CASE
    WHEN t.prev_tier > t.items_subtotal + 1
      THEN LEAST(t.prev_tier, t.fixed_discount_amt)
    ELSE o.tier_discount_amt
  END
FROM targets t
WHERE o.id = t.id;

-- 검증: 깨진 후보가 0건이어야 함 (위의 미리보기 SELECT 재실행)

COMMIT;
-- 문제 있으면 ROLLBACK;
*/
