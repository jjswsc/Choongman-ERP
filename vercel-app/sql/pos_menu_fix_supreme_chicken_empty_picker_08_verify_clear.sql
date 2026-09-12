-- Supreme Chicken (C002) 빈 단계 제거 후 확인
-- 기대: option_selection_groups = [], 옵션·링크 없음

select
  m.id as menu_id,
  m.code,
  m.name,
  m.option_selection_groups,
  m.option_selection_config,
  (
    select count(*)::int
    from public.pos_menu_options o
    where o.menu_id = m.id
  ) as option_row_count,
  (
    select count(*)::int
    from public.pos_menu_option_group_links l
    where l.menu_id = m.id
  ) as link_count
from public.pos_menus m
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken';
