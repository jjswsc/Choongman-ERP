-- Supreme Chicken (C002) 배달 옵션 빈 모달 미리보기
-- ⚠️ C005 등 다른 메뉴 코드는 포함하지 않음
-- 증상: POS 배달에서 탭하면 「เลือกตัวเลือก (1/1)」만 뜨고 선택지가 없음

select
  m.id as menu_id,
  m.code,
  m.name,
  m.option_selection_groups,
  m.option_selection_config,
  o.id as option_id,
  o.name as option_name,
  o.option_type,
  o.option_step_values,
  o.sell_hall,
  o.sell_delivery,
  o.sell_packaging,
  o.sort_order
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id
 and coalesce(o.option_type, 'substitution') = 'substitution'
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
order by m.id, o.sort_order, o.name;
