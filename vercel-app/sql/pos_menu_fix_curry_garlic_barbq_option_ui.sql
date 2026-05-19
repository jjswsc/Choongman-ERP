-- CURRY(C022)·GARLIC(C023) Bar.B.Q 만 옵션 (1/1) part 단계로 나오는 현상
-- GUCHUJANG/SOY(C020/C021)처럼 「기본 S」+ 「M - Boneless」 목록 UI 로 맞춤
-- (fix_barbq_chicken_option_prices.sql §5·§6 과 동일 조치, 재실행 가능)

-- 0) 적용 전 비교
select
  m.code,
  m.name,
  m.option_selection_groups,
  m.option_selection_config
from public.pos_menus m
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code;

-- 1) size/part 단계만 제거 (sidedish 등 부가 단계는 유지). 최초 1회 전체 해제가 필요하면 아래 주석 해제.
-- update public.pos_menus
-- set option_selection_groups = '[]'::jsonb, option_selection_config = '[]'::jsonb
-- where code in ('C020', 'C021', 'C022', 'C023');

update public.pos_menus m
set
  option_selection_groups = coalesce(
    (
      select jsonb_agg(to_jsonb(trim(elem)))
      from jsonb_array_elements_text(coalesce(m.option_selection_groups, '[]'::jsonb)) as elem
      where lower(trim(elem)) not in ('size', 'part')
    ),
    '[]'::jsonb
  ),
  option_selection_config = coalesce(
    (
      select jsonb_agg(cfg)
      from jsonb_array_elements(coalesce(m.option_selection_config, '[]'::jsonb)) as cfg
      where lower(trim(coalesce(cfg->>'key', ''))) not in ('size', 'part')
    ),
    '[]'::jsonb
  )
where m.code in ('C020', 'C021', 'C022', 'C023');

-- 2) size/part 공통 그룹 링크만 제거 (sidedish 링크는 유지)
do $$
begin
  if to_regclass('public.pos_menu_option_group_links') is not null
     and to_regclass('public.pos_option_groups') is not null then
    delete from public.pos_menu_option_group_links l
    using public.pos_menus m, public.pos_option_groups g
    where l.menu_id = m.id
      and l.group_id = g.id
      and m.code in ('C020', 'C021', 'C022', 'C023')
      and lower(trim(coalesce(g.group_key, ''))) in ('size', 'part');
  end if;
end $$;

-- 3) BBQ 치킨은 M - Boneless만 유지: Wing/Drumette 제거 + Boneless만 보장
delete from public.pos_menu_options o
using public.pos_menus m
where o.menu_id = m.id
  and m.code in ('C020', 'C021', 'C022', 'C023')
  and coalesce(o.option_type, 'substitution') = 'substitution'
  and trim(coalesce(o.name, '')) in ('M - Wing', 'M - Drumette');

insert into public.pos_menu_options (
  menu_id, name, price_modifier, price_modifier_delivery, sort_order,
  option_type, option_step_values, sell_hall, sell_delivery, sell_packaging
)
select
  m.id,
  v.name,
  90,
  100,
  v.sort_order,
  'substitution',
  jsonb_build_object('size', 'M', 'part', v.part_key),
  true,
  true,
  true
from public.pos_menus m
cross join (
  values
    ('M - Boneless', 0, 'Boneless')
) as v(name, sort_order, part_key)
where m.code in ('C020', 'C021', 'C022', 'C023')
  and not exists (
    select 1 from public.pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
      and trim(coalesce(o.name, '')) = v.name
  );

-- 4) M - Boneless option_step_values 누락 보정 (null 방지)
update public.pos_menu_options o
set option_step_values = case trim(coalesce(o.name, ''))
  when 'M - Boneless' then jsonb_build_object('size', 'M', 'part', 'Boneless')
  else o.option_step_values
end
from public.pos_menus m
where o.menu_id = m.id
  and m.code in ('C020', 'C021', 'C022', 'C023')
  and coalesce(o.option_type, 'substitution') = 'substitution'
  and trim(coalesce(o.name, '')) = 'M - Boneless'
  and (
    o.option_step_values is null
    or o.option_step_values = 'null'::jsonb
    or trim(coalesce(o.option_step_values::text, '')) in ('', '{}')
  );

-- 5) 적용 후
select
  m.code,
  m.option_selection_groups,
  o.name as option_name,
  o.price_modifier,
  o.option_step_values
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id and coalesce(o.option_type, 'substitution') = 'substitution'
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code, o.sort_order, o.name;
