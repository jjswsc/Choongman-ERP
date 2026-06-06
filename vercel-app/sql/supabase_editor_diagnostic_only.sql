-- ============================================================
-- supabase_editor_diagnostic_only.sql
-- 스키마 변경 없음 — 결과 확인용 SELECT만. Editor에 상시 보관하지 마세요.
-- Guide: vercel-app/sql/SUPABASE_EDITOR_RUNBOOK.md §6
-- ============================================================

-- Grab 주문·웹훅 추적
SELECT id, order_no, status, store_code, memo, created_at
FROM public.pos_orders
WHERE memo ILIKE '%grab_order:001889724231-C8ACVGM1V35HC6%';

SELECT event_kind, unique_key, received_at, payload_json
FROM public.pos_grab_webhook_events
WHERE order_id = '001889724231-C8ACVGM1V35HC6'
ORDER BY received_at;

-- pos_orders 컬럼 목록
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pos_orders'
ORDER BY ordinal_position;

-- 주문 #058 품목 + promoItems (The Street)
SELECT
  o.order_no,
  o.store_code,
  o.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  it->>'name' AS item_name,
  COALESCE(it->>'menuId', it->>'menuId1', it->>'menu_id1') AS menu_id,
  it->>'promoId' AS promo_id,
  it->'promoItems' AS promo_items
FROM public.pos_orders o
CROSS JOIN LATERAL jsonb_array_elements(o.items_json::jsonb) AS it
WHERE o.order_no LIKE '%058%'
  AND o.store_code ILIKE '%street%'
  AND o.created_at >= '2026-06-01'::date
ORDER BY o.created_at DESC;

-- SOY SAUCE BULGOGI SET — 메뉴·프로모·주방 라우팅
SELECT
  pm.id,
  pm.code,
  pm.name,
  pm.kitchen_printer,
  pm.promo_id,
  pm.category,
  pm.category_main,
  pm.is_active,
  pm.price,
  array_agg(DISTINCT pms.store_code) FILTER (WHERE pms.enabled) AS store_scopes
FROM public.pos_menus pm
LEFT JOIN public.pos_menu_store_scopes pms ON pms.menu_id = pm.id AND pms.enabled
WHERE pm.name ILIKE '%SOY SAUCE BULGOGI SET%'
GROUP BY pm.id
ORDER BY pm.id;

SELECT
  pp.id AS promo_id,
  pp.name AS promo_name,
  pi.menu_id,
  pm.name AS component_name,
  pm.kitchen_printer AS component_kitchen_printer,
  pi.quantity
FROM public.pos_promos pp
JOIN public.pos_menus mirror ON mirror.promo_id = pp.id
LEFT JOIN public.pos_promo_items pi ON pi.promo_id = pp.id
LEFT JOIN public.pos_menus pm ON pm.id = pi.menu_id
WHERE mirror.name ILIKE '%SOY SAUCE BULGOGI SET%';

SELECT
  store_code,
  auto_print_kitchen_slip_on_order,
  kitchen_mode,
  kitchen_route_by_menu,
  kitchen_route_by_category
FROM public.pos_printer_settings
WHERE store_code ILIKE '%street%';

-- 오늘(방콕) option_code 비어 있는 품목
WITH orders AS (
  SELECT
    id,
    order_no,
    store_code,
    order_type,
    delivery_app_code,
    created_at,
    items_json::jsonb AS items
  FROM public.pos_orders
  WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
),
lines AS (
  SELECT
    o.id,
    o.order_no,
    o.store_code,
    o.order_type,
    o.delivery_app_code,
    o.created_at,
    it AS line
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS it
)
SELECT
  order_no,
  store_code,
  order_type,
  delivery_app_code,
  created_at,
  COALESCE(line->>'name', '') AS item_name,
  COALESCE(line->>'menuId1', line->>'menuId2', line->>'menuId', '') AS menu_id,
  COALESCE(line->>'optionCode1', line->>'optionCode2', line->>'optionCode', '') AS option_code,
  COALESCE(line->>'note', '') AS note
FROM lines
WHERE COALESCE(line->>'optionCode1', line->>'optionCode2', line->>'optionCode', '') = ''
ORDER BY created_at DESC, order_no;
