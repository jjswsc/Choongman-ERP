-- Supreme Chicken (C002) 링크 제거 후 확인
-- 기대: size/part 그룹 링크 없음. sidedish 링크·김치/단무지는 남아 있을 수 있음.

select
  m.id as menu_id,
  m.code,
  m.name,
  m.option_selection_groups,
  g.group_key,
  g.name as group_name,
  i.item_name,
  i.sell_delivery as item_sell_delivery
from public.pos_menus m
left join public.pos_menu_option_group_links l
  on l.menu_id = m.id
left join public.pos_option_groups g
  on g.id = l.group_id
left join public.pos_option_group_items i
  on i.group_id = g.id
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
order by g.group_key, i.sort_order, i.item_name;
