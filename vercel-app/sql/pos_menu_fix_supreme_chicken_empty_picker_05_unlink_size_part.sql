-- Supreme Chicken (C002) size/part 공통 그룹 링크만 제거 (sidedish 링크는 유지)
-- ⚠️ C005 등 다른 메뉴 코드는 절대 포함하지 않음
-- 04_preview_links 확인 후에만 실행

begin;

delete from public.pos_menu_option_group_links l
using public.pos_menus m, public.pos_option_groups g
where l.menu_id = m.id
  and l.group_id = g.id
  and (
    lower(trim(coalesce(m.code, ''))) = 'c002'
    or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
  )
  and lower(trim(coalesce(g.group_key, ''))) in ('size', 'part');

commit;
