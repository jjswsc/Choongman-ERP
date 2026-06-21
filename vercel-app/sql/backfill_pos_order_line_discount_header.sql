-- 품목 lineDiscountAmt는 있는데 discount_amt·total이 할인 전으로 남은 주문 보정
-- (예: CMBANGNA-20260620-048, id=28382)
-- Supabase SQL Editor · 충만 프로덕션 DB에서만 실행

WITH line_disc AS (
  SELECT
    o.id,
    o.order_no,
    o.subtotal,
    COALESCE(o.delivery_fee, 0) AS delivery_fee,
    COALESCE(o.packaging_fee, 0) AS packaging_fee,
    o.discount_amt,
    o.total,
    o.payment_cash,
    o.payment_card,
    o.payment_qr,
    o.payment_other,
    COALESCE(o.payment_delivery_app, 0) AS payment_delivery_app,
    COALESCE(
      (
        SELECT SUM(
          GREATEST(
            0,
            COALESCE(
              NULLIF((elem->>'lineDiscountAmt')::numeric, NULL),
              NULLIF((elem->>'line_discount_amt')::numeric, NULL),
              0
            )
          )
        )
        FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR trim(o.items_json) = '' THEN '[]'::jsonb
            ELSE o.items_json::jsonb
          END
        ) AS elem
      ),
      0
    ) AS line_discount_sum
  FROM pos_orders o
),
candidates AS (
  SELECT
    id,
    order_no,
    line_discount_sum,
    GREATEST(0, LEAST(subtotal, line_discount_sum)) AS discount_fix,
    GREATEST(
      0,
      subtotal
        - GREATEST(0, LEAST(subtotal, line_discount_sum))
        + delivery_fee
        + packaging_fee
    ) AS total_fix,
    payment_cash + payment_card + payment_qr + payment_other + payment_delivery_app AS payment_sum
  FROM line_disc
  WHERE line_discount_sum > 0.02
    AND COALESCE(discount_amt, 0) < line_discount_sum - 0.02
)
UPDATE pos_orders o
SET
  discount_amt = c.discount_fix,
  total = c.total_fix
FROM candidates c
WHERE o.id = c.id
  AND (
    ABS(c.payment_sum - c.total_fix) <= 0.03
    OR c.payment_sum <= 0.005
  )
RETURNING o.id, o.order_no, o.discount_amt, o.total, c.payment_sum;
