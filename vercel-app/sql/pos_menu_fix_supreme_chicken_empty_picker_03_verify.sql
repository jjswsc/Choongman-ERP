-- Supreme Chicken (C002) 적용 후 확인
-- 기대: Size S / part 행 없음. 김치·단무지 등 사이드만 남을 수 있음.

select
  m.id as menu_id,
  m.code,
  m.name,
  m.option_selection_groups,
  o.id as option_id,
  o.name as option_name,
  o.option_step_values,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id
 and coalesce(o.option_type, 'substitution') = 'substitution'
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
order by m.id, o.sort_order, o.name;
