-- 1/3 조회만 — Samgyeopsal 메뉴에 Soy Sauce meal_options 가 붙어 있는지
-- 증상: Seacon QR — Samgyeopsal Combo 탭 → K044/K040 Soy Sauce 옵션 표시
-- pos_orders UPDATE 없음 — 영업 중 조회 가능

SELECT
  m.id AS menu_id,
  m.code AS menu_code,
  m.name AS menu_name,
  m.price,
  m.is_active,
  m.sell_hall,
  m.option_selection_groups,
  o.id AS option_id,
  o.name AS option_name,
  o.option_code,
  o.option_type,
  o.option_step_values,
  o.price_modifier,
  o.sort_order,
  o.sell_hall AS option_sell_hall
FROM public.pos_menus m
JOIN public.pos_menu_options o ON o.menu_id = m.id
WHERE m.name ILIKE '%Samgyeopsal%'
  AND (
    o.name ILIKE '%Soy Sauce%'
    OR o.name ILIKE '%K044%'
    OR o.name ILIKE '%K040%'
    OR COALESCE(o.option_step_values::text, '') ILIKE '%Soy Sauce%'
    OR COALESCE(o.option_step_values::text, '') ILIKE '%K044%'
    OR COALESCE(o.option_step_values::text, '') ILIKE '%K040%'
  )
ORDER BY m.name, o.sort_order NULLS LAST, o.id;
