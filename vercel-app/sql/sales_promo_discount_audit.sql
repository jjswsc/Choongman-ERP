-- =============================================================================
-- 세트·프로모 할인 집계 감사 — 5월 vs 6월 (Supabase SQL Editor)
-- 매출 관리 > 할인현황 > 세트·프로모 할인 과 posSalesByPromo 집계 기준과 동일하게
-- items_json 에 promoId / promoCode 가 있는 줄만 "세트·프로모 줄"로 잡힙니다.
--
-- ★ params 의 start_date / end_date 를 바꿔 가며 실행하세요.
-- ★ 영업일(08:00 방콕) 경계는 앱과 동일 RPC/필터가 필요하면 pos_orders.created_at + 매장별
--   business_day_start 를 쓰세요. 여기서는 calendar date(created_at AT TIME ZONE 'Asia/Bangkok') 로 근사합니다.
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-05-01' AS start_date,
    DATE '2026-05-31' AS end_date
),
completed AS (
  SELECT
    po.id,
    po.store_code,
    po.total,
    po.discount_amt,
    po.coupon_discount_amt,
    (po.created_at AT TIME ZONE 'Asia/Bangkok')::date AS biz_date_bkk,
    po.items_json::jsonb AS items
  FROM public.pos_orders po
  CROSS JOIN params p
  WHERE po.status IN ('completed', 'paid', 'ready')
    AND (po.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN p.start_date AND p.end_date
    AND po.items_json IS NOT NULL
    AND po.items_json <> '[]'
),
lines AS (
  SELECT
    c.id AS order_id,
    c.store_code,
    c.biz_date_bkk,
    c.total AS order_total,
    c.discount_amt,
    c.coupon_discount_amt,
    ordinality - 1 AS line_idx,
    line
  FROM completed c
  CROSS JOIN LATERAL jsonb_array_elements(c.items) WITH ORDINALITY AS t(line, ordinality)
),
classified AS (
  SELECT
    l.*,
    NULLIF(trim(COALESCE(line->>'promoId', line->>'promo_id', '')), '') AS promo_id,
    NULLIF(trim(COALESCE(line->>'promoCode', line->>'promo_code', '')), '') AS promo_code,
    NULLIF(trim(COALESCE(line->>'name', '')), '') AS line_name,
    COALESCE(
      NULLIF(trim(COALESCE(line->>'quantity', line->>'qty', '1')), '')::numeric,
      1
    ) AS qty,
    COALESCE(NULLIF(trim(COALESCE(line->>'price', '0')), '')::numeric, 0) AS unit_price,
    (line ? 'promoRegularPrice') OR (line ? 'promo_regular_price') AS has_regular_snapshot,
    (jsonb_typeof(COALESCE(line->'promoItems', line->'promo_items')) = 'array'
      AND jsonb_array_length(COALESCE(line->'promoItems', line->'promo_items', '[]'::jsonb)) > 0
    ) AS has_promo_items,
    (line->>'promoRegularPrice') IS NOT NULL OR (line->>'promo_regular_price') IS NOT NULL AS has_regular_field
  FROM lines l
),
tagged AS (
  SELECT *
  FROM classified
  WHERE promo_id IS NOT NULL OR promo_code IS NOT NULL
),
suspicious_untagged AS (
  SELECT *
  FROM classified
  WHERE promo_id IS NULL
    AND promo_code IS NULL
    AND (
      line_name ~* '(set|세트|combo|bundle|festival|프로모|promo|2604|2605|2606|-S0[0-9])'
      OR line_name ~* '\[(april|may|june|4월|5월|6월)\]'
    )
)

-- A) 기간 요약 (앱 상단 카드와 대조)
SELECT
  'A_period_summary' AS section,
  COUNT(DISTINCT c.id) AS completed_orders,
  ROUND(SUM(c.total)::numeric, 2) AS period_gross_sales,
  ROUND(SUM(COALESCE(c.discount_amt, 0) + COALESCE(c.coupon_discount_amt, 0))::numeric, 2) AS payment_discount_sum
FROM completed c

UNION ALL

SELECT
  'A_promo_tagged_lines' AS section,
  COUNT(*) AS line_count,
  ROUND(SUM(qty * unit_price)::numeric, 2) AS tagged_line_gross_sale_approx,
  COUNT(*) FILTER (WHERE NOT has_regular_snapshot AND NOT has_promo_items) AS maybe_unresolved_regular
FROM tagged

UNION ALL

SELECT
  'A_suspicious_untagged' AS section,
  COUNT(*) AS suspicious_lines,
  ROUND(SUM(qty * unit_price)::numeric, 2) AS suspicious_sale_approx,
  COUNT(DISTINCT order_id) AS suspicious_orders
FROM suspicious_untagged;

-- B) 프로모 코드별 (앱 하단 표와 대조)
-- SELECT
--   COALESCE(promo_code, promo_id, line_name) AS promo_key,
--   promo_code,
--   promo_id,
--   SUM(qty) AS qty,
--   ROUND(SUM(qty * unit_price)::numeric, 2) AS sale_approx,
--   COUNT(*) FILTER (WHERE has_regular_snapshot) AS lines_with_snapshot,
--   COUNT(*) FILTER (WHERE has_promo_items) AS lines_with_promo_items,
--   COUNT(*) FILTER (WHERE NOT has_regular_snapshot AND NOT has_promo_items) AS lines_need_db_fallback
-- FROM tagged
-- GROUP BY 1, 2, 3
-- ORDER BY sale_approx DESC;

-- C) promoId 는 있는데 pos_promos 에 없음 (정가 역산 실패 → 내재 할인 0 가능)
-- SELECT
--   t.promo_id,
--   t.promo_code,
--   COUNT(*) AS lines,
--   SUM(t.qty) AS qty,
--   ROUND(SUM(t.qty * t.unit_price)::numeric, 2) AS sale_approx
-- FROM tagged t
-- LEFT JOIN public.pos_promos p ON p.id::text = t.promo_id
-- WHERE t.promo_id IS NOT NULL
--   AND p.id IS NULL
-- GROUP BY 1, 2
-- ORDER BY sale_approx DESC;

-- D) promoCode 만 있고 promoId 없음 (DB 역산 불가 → 내재 할인 누락)
-- SELECT
--   promo_code,
--   COUNT(*) AS lines,
--   SUM(qty) AS qty,
--   ROUND(SUM(qty * unit_price)::numeric, 2) AS sale_approx
-- FROM tagged
-- WHERE promo_id IS NULL
--   AND promo_code IS NOT NULL
-- GROUP BY 1
-- ORDER BY sale_approx DESC;

-- E) 5월 vs 6월 한 번에 비교 (params 대신 고정)
-- WITH months AS (
--   SELECT DATE '2026-05-01' AS m_start, DATE '2026-05-31' AS m_end, '2026-05' AS ym
--   UNION ALL
--   SELECT DATE '2026-06-01', DATE '2026-06-30', '2026-06'
-- ),
-- ... (completed/ tagged 동일 패턴, GROUP BY ym)
