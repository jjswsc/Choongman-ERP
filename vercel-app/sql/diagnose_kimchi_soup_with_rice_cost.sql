-- KIMCHI SOUP With Rice: 목록 원가 vs 실적(기본-only) 괴리 진단
-- Supabase SQL Editor 실행. params만 기간·매장에 맞게 수정.
--
-- 기대:
--   master_with_rice_cost ≈ 찌개 base + 밥(소스) (목록 옵션 행과 유사)
--   base_only_unit_cost 가 현저히 작으면 → 주문 option_id null + 합성명 이슈
--   option_id_null_pct 높으면 → 앱 추론 패치 대상

WITH params AS (
  SELECT
    '2026-08-01'::date AS start_d,
    '2026-08-09'::date AS end_d,
    '%'::text AS store_pat
),
menus AS (
  SELECT m.id, m.code, m.name, m.price, m.category_main
  FROM public.pos_menus m
  WHERE m.name ILIKE '%kimchi%soup%'
     OR m.name ILIKE '%김치%'
),
opts AS (
  SELECT
    o.id AS option_id,
    o.menu_id,
    o.name AS option_name,
    o.option_type,
    o.additive_source_menu_id,
    o.item_code,
    o.quantity AS opt_qty,
    o.price_modifier
  FROM public.pos_menu_options o
  JOIN menus m ON m.id = o.menu_id
  WHERE o.name ILIKE '%rice%'
     OR o.name ILIKE '%밥%'
     OR o.name ILIKE '%with%'
),
bom AS (
  SELECT
    i.menu_id,
    CASE WHEN i.option_id IS NULL OR i.option_id <= 0 THEN NULL ELSE i.option_id END AS option_id,
    round(sum(
      CASE WHEN coalesce(i.ingredient_type, 'food') = 'packaging' THEN 0
      ELSE coalesce(nullif(it.cost, 0), it.price, 0)::numeric
        * coalesce(i.quantity, 1)
        * (1 + coalesce(i.loss_rate, 0) / 100.0)
        / greatest(coalesce(nullif(it.total_quantity, 0), 1)::numeric, 0.0001)
      END
    )::numeric, 1) AS food_cost
  FROM public.pos_menu_ingredients i
  LEFT JOIN public.items it ON btrim(it.code) = btrim(i.item_code)
  WHERE i.menu_id IN (SELECT id FROM menus)
     OR i.menu_id IN (SELECT additive_source_menu_id FROM opts WHERE additive_source_menu_id IS NOT NULL)
  GROUP BY 1, 2
),
master AS (
  SELECT
    '1_master' AS step,
    m.id AS menu_id,
    m.name AS menu_name,
    m.price AS menu_price,
    o.option_id,
    o.option_name,
    o.option_type,
    o.additive_source_menu_id,
    o.price_modifier,
    coalesce(bb.food_cost, 0) AS base_food_cost,
    coalesce(bo.food_cost, 0) AS option_own_food_cost,
    coalesce(bs.food_cost, 0) AS source_food_cost,
    CASE
      WHEN lower(coalesce(o.option_type, '')) = 'additive' THEN
        coalesce(bb.food_cost, 0)
        + coalesce(bs.food_cost, 0) * coalesce(o.opt_qty, 1)
        + coalesce(bo.food_cost, 0)
      WHEN o.option_id IS NOT NULL AND coalesce(bo.food_cost, 0) > 0 THEN coalesce(bo.food_cost, 0)
      WHEN o.option_id IS NOT NULL THEN coalesce(bb.food_cost, 0)
      ELSE coalesce(bb.food_cost, 0)
    END AS list_like_unit_cost
  FROM menus m
  LEFT JOIN opts o ON o.menu_id = m.id
  LEFT JOIN bom bb ON bb.menu_id = m.id AND bb.option_id IS NULL
  LEFT JOIN bom bo ON bo.menu_id = m.id AND bo.option_id = o.option_id
  LEFT JOIN bom bs ON bs.menu_id = o.additive_source_menu_id AND bs.option_id IS NULL
),
orders AS (
  SELECT o.id, o.store_code, o.items_json
  FROM public.pos_orders o
  CROSS JOIN params p
  WHERE (o.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN p.start_d AND p.end_d
    AND o.store_code ILIKE p.store_pat
    AND (
      lower(coalesce(o.status, '')) LIKE '%complete%'
      OR lower(coalesce(o.status, '')) IN ('paid', 'done', 'closed', 'success', 'ready')
    )
),
lines AS (
  SELECT
    coalesce(
      nullif(btrim(e->>'menuId1'), ''),
      nullif(btrim(e->>'menuId'), ''),
      nullif(split_part(coalesce(e->>'id', ''), '-', 1), '')
    ) AS menu_id,
    coalesce(
      nullif(btrim(e->>'optionId1'), ''),
      nullif(btrim(e->>'optionId'), ''),
      nullif(btrim(e->>'option_id'), '')
    ) AS option_id,
    coalesce(nullif(btrim(e->>'menuName'), ''), nullif(btrim(e->>'name'), '')) AS line_name,
    greatest(
      coalesce((e->>'quantity')::numeric, 0),
      coalesce((e->>'qty')::numeric, 0),
      0
    ) AS qty
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items_json::jsonb) e
  WHERE coalesce(e->>'cancelledAt', e->>'cancelled_at', '') = ''
),
kimchi_lines AS (
  SELECT *
  FROM lines
  WHERE line_name ILIKE '%kimchi%soup%'
     OR line_name ILIKE '%김치%'
     OR menu_id IN (SELECT id::text FROM menus)
)
SELECT * FROM master
ORDER BY menu_id, option_id NULLS FIRST;

-- ② 주문 라인: option_id null 비율·합성명
WITH params AS (
  SELECT
    '2026-08-01'::date AS start_d,
    '2026-08-09'::date AS end_d,
    '%'::text AS store_pat
),
orders AS (
  SELECT o.id, o.items_json
  FROM public.pos_orders o
  CROSS JOIN params p
  WHERE (o.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN p.start_d AND p.end_d
    AND o.store_code ILIKE p.store_pat
    AND (
      lower(coalesce(o.status, '')) LIKE '%complete%'
      OR lower(coalesce(o.status, '')) IN ('paid', 'done', 'closed', 'success', 'ready')
    )
),
lines AS (
  SELECT
    coalesce(
      nullif(btrim(e->>'menuId1'), ''),
      nullif(btrim(e->>'menuId'), ''),
      nullif(split_part(coalesce(e->>'id', ''), '-', 1), '')
    ) AS menu_id,
    coalesce(
      nullif(btrim(e->>'optionId1'), ''),
      nullif(btrim(e->>'optionId'), ''),
      nullif(btrim(e->>'option_id'), '')
    ) AS option_id,
    coalesce(nullif(btrim(e->>'menuName'), ''), nullif(btrim(e->>'name'), '')) AS line_name,
    greatest(
      coalesce((e->>'quantity')::numeric, 0),
      coalesce((e->>'qty')::numeric, 0),
      0
    ) AS qty
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items_json::jsonb) e
  WHERE coalesce(e->>'cancelledAt', e->>'cancelled_at', '') = ''
),
kimchi_lines AS (
  SELECT *
  FROM lines
  WHERE line_name ILIKE '%kimchi%soup%with%rice%'
     OR line_name ILIKE '%kimchi soup with rice%'
)
SELECT
  '2_order_lines' AS step,
  line_name,
  menu_id,
  option_id,
  sum(qty) AS qty,
  count(*) AS line_rows,
  round(
    100.0 * sum(qty) FILTER (WHERE option_id IS NULL OR btrim(option_id) = '')
      / nullif(sum(qty), 0),
    1
  ) AS option_id_null_pct
FROM kimchi_lines
GROUP BY 1, 2, 3, 4
ORDER BY qty DESC
LIMIT 40;
