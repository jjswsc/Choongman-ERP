-- Supreme Chicken (C002) — 고정 사이즈(S/M/L 없음), sidedish만
-- ⚠️ C005 등 다른 메뉴 코드는 절대 포함하지 않음 (매장: Supreme=C002, Soy Spring Onion=C005)
--
-- 증상: POS 배달에서 「Size S - Boneless」가 선택·주방 인쇄됨
-- C005(SOY SAUCE AND SPRING ONION) 복구: pos_menu_restore_c005_soy_spring_onion_options.sql

-- 0) 적용 전
select
  m.code,
  m.name,
  m.category,
  m.option_selection_groups,
  m.option_selection_config,
  o.name as option_name,
  o.option_step_values,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id and coalesce(o.option_type, 'substitution') = 'substitution'
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
order by m.code, o.sort_order, o.name;

-- 1) size/part 단계 제거 (sidedish 등 부가 단계만 유지)
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
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken';

-- 2) size/part 공통 옵션 그룹 링크 제거
do $$
begin
  if to_regclass('public.pos_menu_option_group_links') is not null
     and to_regclass('public.pos_option_groups') is not null then
    delete from public.pos_menu_option_group_links l
    using public.pos_menus m, public.pos_option_groups g
    where l.menu_id = m.id
      and l.group_id = g.id
      and (
        lower(trim(coalesce(m.code, ''))) = 'c002'
        or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
      )
      and lower(trim(coalesce(g.group_key, ''))) in ('size', 'part');
  end if;
end $$;

-- 3) 사이즈·부위 substitution 행 제거 (김치·단무지 등 사이드는 유지)
delete from public.pos_menu_options o
using public.pos_menus m
where o.menu_id = m.id
  and (
    lower(trim(coalesce(m.code, ''))) = 'c002'
    or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
  )
  and coalesce(o.option_type, 'substitution') = 'substitution'
  and (
    trim(coalesce(o.name, '')) ~* '^\s*(size\s*)?[sml]\s*[-–—]'
    or trim(coalesce(o.name, '')) ~* '^\s*(size\s*)?[sml]\s*$'
    or trim(coalesce(o.name, '')) ~* '^(s\s*[-–—]?\s*)?(순살|boneless)\s*$'
    or trim(coalesce(o.name, '')) ~* '^m\s*[-–—]\s*(boneless|wing|drumette)'
    or (o.option_step_values ? 'size')
    or (o.option_step_values ? 'part')
  )
  and trim(coalesce(o.name, '')) !~* '(kimchi|pickled|radish|단무|김치|ไช)';

-- 4) Kimchi·Pickled Radish option_step_values 보정
with targets as (
  select m.id as menu_id
  from public.pos_menus m
  where lower(trim(coalesce(m.code, ''))) = 'c002'
     or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
),
patch as (
  select
    o.id,
    jsonb_build_object('sidedish', trim(coalesce(o.name, ''))) as step_json
  from public.pos_menu_options o
  join targets t on t.menu_id = o.menu_id
  where coalesce(o.option_type, 'substitution') = 'substitution'
    and trim(coalesce(o.name, '')) ~* '(kimchi|pickled|radish|단무|김치|ไช)'
)
update public.pos_menu_options o
set option_step_values = p.step_json
from patch p
where o.id = p.id
  and (
    o.option_step_values is null
    or o.option_step_values = 'null'::jsonb
    or trim(coalesce(o.option_step_values::text, '')) in ('', '{}')
    or o.option_step_values is distinct from p.step_json
  );

-- 5) 적용 후 (Supreme만)
select
  m.code,
  m.name,
  m.option_selection_groups,
  o.name as option_name,
  o.option_step_values,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id and coalesce(o.option_type, 'substitution') = 'substitution'
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
order by m.code, o.sort_order, o.name;
