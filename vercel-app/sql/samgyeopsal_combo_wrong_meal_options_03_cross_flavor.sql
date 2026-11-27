-- 3/3 조회만 — 메뉴명과 옵션명/단계값이 다른 맛(flavor)인 전 메뉴 (유사 사고 탐지)
-- 예: Samgyeopsal 메뉴 + Soy Sauce 옵션, Gochujang 메뉴 + Soy Sauce 옵션 등
-- 이것만 복사 → Run

SELECT
  m.id AS menu_id,
  m.code AS menu_code,
  m.name AS menu_name,
  o.id AS option_id,
  o.name AS option_name,
  o.option_step_values
FROM public.pos_menus m
JOIN public.pos_menu_options o ON o.menu_id = m.id
WHERE
  (
    m.name ILIKE '%Samgyeopsal%'
    AND (
      o.name ILIKE '%Soy Sauce%'
      OR o.name ILIKE '%Gochujang%'
      OR COALESCE(o.option_step_values::text, '') ILIKE '%Soy Sauce%'
      OR COALESCE(o.option_step_values::text, '') ILIKE '%Gochujang%'
    )
  )
  OR (
    m.name ILIKE '%Soy Sauce%Pork%'
    AND (
      o.name ILIKE '%Samgyeopsal%'
      OR o.name ILIKE '%Gochujang%'
      OR COALESCE(o.option_step_values::text, '') ILIKE '%Samgyeopsal%'
      OR COALESCE(o.option_step_values::text, '') ILIKE '%Gochujang%'
    )
  )
  OR (
    m.name ILIKE '%Gochujang%Pork%'
    AND (
      o.name ILIKE '%Samgyeopsal%'
      OR o.name ILIKE '%Soy Sauce%'
      OR COALESCE(o.option_step_values::text, '') ILIKE '%Samgyeopsal%'
      OR COALESCE(o.option_step_values::text, '') ILIKE '%Soy Sauce%'
    )
  )
ORDER BY m.name, o.sort_order NULLS LAST, o.id;
