-- Supreme Chicken (C002) 공통 옵션 그룹 링크·아이템 확인
-- ⚠️ C005 등 다른 메뉴 코드는 포함하지 않음
-- POS는 pos_menu_options가 없어도 이 링크로 선택지를 만듦

select
  m.id as menu_id,
  m.code,
  m.name,
  g.id as group_id,
  g.group_key,
  g.name as group_name,
  l.id as link_id,
  l.sell_hall as link_sell_hall,
  l.sell_delivery as link_sell_delivery,
  l.required as link_required,
  i.id as item_id,
  i.item_name,
  i.sell_hall as item_sell_hall,
  i.sell_delivery as item_sell_delivery,
  i.sort_order as item_sort_order
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
