-- 검증 — 적용 후 이것만 복사 → Run
-- 기대:
--   K043: option_count=0, option_selection_groups=[]
--   K036/K037 Combo·Set: meal_option 단계값이 Combo / Set
--   cross-flavor (Samgyeopsal/Gochujang + Soy Sauce 단계값) 0건

SELECT
  m.id AS menu_id,
  m.code,
  m.name,
  m.option_selection_groups,
  (
    SELECT count(*)::int FROM public.pos_menu_options o WHERE o.menu_id = m.id
  ) AS option_count,
  (
    SELECT string_agg(
      coalesce(o.name, '') || ' => ' || coalesce(o.option_step_values->>'meal_option', ''),
      ' | ' ORDER BY o.sort_order NULLS LAST, o.id
    )
    FROM public.pos_menu_options o
    WHERE o.menu_id = m.id
  ) AS meal_option_map
FROM public.pos_menus m
WHERE m.id IN (429, 430, 439)
ORDER BY m.code;
