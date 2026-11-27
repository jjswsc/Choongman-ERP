-- 2/3 조회만 — 삼겹/간장/고추장 본메뉴·Combo·Set 코드 후보 + 옵션 요약
-- 올바른 Samgyeopsal Combo/Set 코드·옵션 구조를 확인용
-- 이것만 복사 → Run

SELECT
  m.id AS menu_id,
  m.code AS menu_code,
  m.name AS menu_name,
  m.price,
  m.category_main,
  m.category,
  m.is_active,
  m.sell_hall,
  m.sell_delivery,
  m.option_selection_groups,
  (
    SELECT count(*)::int
    FROM public.pos_menu_options o
    WHERE o.menu_id = m.id
  ) AS option_count,
  (
    SELECT string_agg(
      coalesce(o.name, '') || ' | ' || coalesce(o.option_step_values::text, '{}'),
      ' || ' ORDER BY o.sort_order NULLS LAST, o.id
    )
    FROM public.pos_menu_options o
    WHERE o.menu_id = m.id
  ) AS options_summary
FROM public.pos_menus m
WHERE (
    m.name ILIKE '%Samgyeopsal%Pork%Belly%'
    OR m.name ILIKE '%Soy Sauce%Pork%Bulgogi%'
    OR m.name ILIKE '%Gochujang%Pork%Bulgogi%'
  )
ORDER BY
  CASE
    WHEN m.name ILIKE '%Samgyeopsal%' THEN 1
    WHEN m.name ILIKE '%Soy Sauce%' THEN 2
    ELSE 3
  END,
  m.name;
