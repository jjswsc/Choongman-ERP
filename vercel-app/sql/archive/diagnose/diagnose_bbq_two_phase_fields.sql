-- BBQ 2단계 picker 판정에 들어가는 "원본 필드" 진단 (2026-06-07)
-- isBarBqChickenMenu / shouldUseBarBqTwoPhaseOptionPicker 가 쓰는 값 그대로 확인.
--
-- 코드 판정식 재현:
--   isBarBqChicken = (lower(category||' '||category_main) LIKE '%bar.b.q%'
--                     OR ... '%barbq%' OR ... '%bbq fried%')  ← 이게 false면 2단계 안 켜짐
--
-- 기대: C020~C023 의 cat_concat 에 'bar.b.q' 가 들어가 있어야 한다.

select
  m.code,
  m.name              as menu_name,
  m.category,
  m.category_main,
  lower(coalesce(m.category,'') || ' ' || coalesce(m.category_main,'')) as cat_concat,
  (
    lower(coalesce(m.category,'') || ' ' || coalesce(m.category_main,'')) like '%bar.b.q%'
    or lower(coalesce(m.category,'') || ' ' || coalesce(m.category_main,'')) like '%barbq%'
    or lower(coalesce(m.category,'') || ' ' || coalesce(m.category_main,'')) like '%bbq fried%'
  )                   as is_barbq_by_category,
  m.option_selection_groups,
  m.option_selection_config
from public.pos_menus m
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code;
