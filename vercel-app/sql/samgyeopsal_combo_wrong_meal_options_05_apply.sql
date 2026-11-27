-- 5/5 적용 — Seacon QR Samgyeopsal Combo 에 Soy Sauce 옵션이 보이는 문제
-- 영업 중 가능: pos_orders UPDATE 없음. 메뉴·옵션 메타만 수정.
-- 적용 내용:
--   1) K043(Samgyeopsal Combo) meal_option 제거 (단품 Combo 는 선택 단계 불필요)
--   2) K037(Gochujang)·K036(Soy Sauce) Combo/Set 단계값을 짧은 Combo/Set 으로 맞춤
-- 미리보기: samgyeopsal_combo_wrong_meal_options_04_apply_preview.sql
-- 이것만 복사 → Run

BEGIN;

-- 1) K043 잘못된 meal_option 행 삭제
DELETE FROM public.pos_menu_options
WHERE menu_id = 439
  AND id IN (658, 659);

-- 2) K043 선택 단계 비우기
UPDATE public.pos_menus
SET
  option_selection_groups = '[]'::jsonb,
  option_selection_config = '[]'::jsonb
WHERE id = 439
  AND code = 'K043';

-- 3) Gochujang(K037)·Soy Sauce(K036) Combo/Set 단계값 → 짧은 라벨
UPDATE public.pos_menu_options o
SET option_step_values =
  jsonb_set(
    COALESCE(o.option_step_values, '{}'::jsonb),
    '{meal_option}',
    to_jsonb(o.name)
  )
FROM public.pos_menus m
WHERE o.menu_id = m.id
  AND m.id IN (429, 430)
  AND m.code IN ('K036', 'K037')
  AND o.option_type = 'substitution'
  AND o.name IN ('Combo', 'Set')
  AND COALESCE(o.option_step_values->>'meal_option', '') ILIKE '%Soy Sauce%';

COMMIT;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('samgyeopsal_combo_wrong_meal_options_05_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
