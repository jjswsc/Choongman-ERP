-- 4/5 조회만 — 적용 전 미리보기 (K043 옵션 삭제 + K036/K037 단계값 정리 대상)
-- 이것만 복사 → Run. UPDATE/DELETE 없음.

SELECT *
FROM (
  -- A) K043 Samgyeopsal Combo — 삭제 예정 옵션
  SELECT
    'K043_DELETE' AS action,
    m.id AS menu_id,
    m.code,
    m.name AS menu_name,
    o.id AS option_id,
    o.name AS option_name,
    o.option_step_values
  FROM public.pos_menus m
  JOIN public.pos_menu_options o ON o.menu_id = m.id
  WHERE m.id = 439
    AND o.id IN (658, 659)

  UNION ALL

  -- B) K037 Gochujang / K036 Soy Sauce — 단계값을 Combo/Set 으로 맞출 행
  SELECT
    'STEP_SHORTEN' AS action,
    m.id AS menu_id,
    m.code,
    m.name AS menu_name,
    o.id AS option_id,
    o.name AS option_name,
    o.option_step_values
  FROM public.pos_menus m
  JOIN public.pos_menu_options o ON o.menu_id = m.id
  WHERE m.id IN (429, 430)
    AND o.option_type = 'substitution'
    AND o.name IN ('Combo', 'Set')
    AND COALESCE(o.option_step_values->>'meal_option', '') ILIKE '%Soy Sauce%'
) t
ORDER BY action, menu_id, option_id;
