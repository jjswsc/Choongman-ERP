-- menu_id=29 (KIMCHI SOUP With Rice 주문) 마스터·BOM·옵션 점검
-- Supabase SQL Editor에 붙여넣기

-- ① 메뉴 29 본체
SELECT
  '1_menu' AS step,
  m.id,
  m.code,
  m.name,
  m.price,
  m.price_delivery,
  m.category_main,
  m.category,
  m.promo_id
FROM public.pos_menus m
WHERE m.id = 29;

-- ② 메뉴 29의 옵션 (With Rice 가산이 여기 있는지)
SELECT
  '2_options' AS step,
  o.id AS option_id,
  o.name,
  o.option_type,
  o.price_modifier,
  o.additive_source_menu_id,
  o.item_code,
  o.quantity
FROM public.pos_menu_options o
WHERE o.menu_id = 29
ORDER BY o.id;

-- ③ 메뉴 29 BOM (option null / 옵션별)
SELECT
  '3_bom_29' AS step,
  i.option_id,
  coalesce(o.name, '(기본)') AS option_name,
  i.item_code,
  i.quantity,
  i.loss_rate,
  i.ingredient_type,
  it.name AS item_name,
  it.cost,
  it.price AS item_price,
  it.total_quantity,
  round(
    coalesce(nullif(it.cost, 0), it.price, 0)::numeric
      * coalesce(i.quantity, 1)
      * (1 + coalesce(i.loss_rate, 0) / 100.0)
      / greatest(coalesce(nullif(it.total_quantity, 0), 1)::numeric, 0.0001)
  , 2) AS line_food_cost
FROM public.pos_menu_ingredients i
LEFT JOIN public.pos_menu_options o ON o.id = i.option_id
LEFT JOIN public.items it ON btrim(it.code) = btrim(i.item_code)
WHERE i.menu_id = 29
ORDER BY i.option_id NULLS FIRST, i.id;

-- ④ 이름에 Kimchi Soup 있는 다른 메뉴 + With Rice류 옵션 (합성 매칭 후보)
SELECT
  '4_compose_candidates' AS step,
  m.id AS menu_id,
  m.name AS menu_name,
  m.price,
  o.id AS option_id,
  o.name AS option_name,
  o.option_type,
  o.additive_source_menu_id,
  o.price_modifier,
  lower(btrim(m.name) || ' ' || btrim(o.name)) AS composed_name
FROM public.pos_menus m
JOIN public.pos_menu_options o ON o.menu_id = m.id
WHERE (
    m.name ILIKE '%kimchi%soup%'
    OR m.name ILIKE '%김치%'
  )
  AND (
    o.name ILIKE '%rice%'
    OR o.name ILIKE '%밥%'
    OR o.name ILIKE '%with%'
  )
ORDER BY m.id, o.id;

-- ⑤ 메뉴 29 기본 BOM 합계 vs 합성 후보 목록식 원가
WITH bom AS (
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
  GROUP BY 1, 2
)
SELECT
  '5_cost_compare' AS step,
  'menu_29_base_only' AS kind,
  coalesce((SELECT food_cost FROM bom WHERE menu_id = 29 AND option_id IS NULL), 0) AS unit_food_cost
UNION ALL
SELECT
  '5_cost_compare',
  'compose:' || m.id::text || '+' || o.id::text,
  CASE
    WHEN lower(coalesce(o.option_type, '')) = 'additive' THEN
      coalesce(bb.food_cost, 0)
      + coalesce(bs.food_cost, 0) * coalesce(o.quantity, 1)
      + coalesce(bo.food_cost, 0)
    WHEN coalesce(bo.food_cost, 0) > 0 THEN coalesce(bo.food_cost, 0)
    ELSE coalesce(bb.food_cost, 0)
  END
FROM public.pos_menus m
JOIN public.pos_menu_options o ON o.menu_id = m.id
LEFT JOIN bom bb ON bb.menu_id = m.id AND bb.option_id IS NULL
LEFT JOIN bom bo ON bo.menu_id = m.id AND bo.option_id = o.id
LEFT JOIN bom bs ON bs.menu_id = o.additive_source_menu_id AND bs.option_id IS NULL
WHERE lower(btrim(m.name) || ' ' || btrim(o.name)) = lower('KIMCHI SOUP With Rice')
   OR (
     m.name ILIKE '%kimchi%soup%'
     AND o.name ILIKE '%with%rice%'
   );
