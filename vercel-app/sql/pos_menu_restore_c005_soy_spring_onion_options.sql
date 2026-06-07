-- C005 SOY SAUCE AND SPRING ONION CHICKEN — part(M) + sidedish 복구
-- 배경: pos_menu_fix_supreme_chicken_delivery_options.sql 이 C005를 Supreme 으로 오인해
--       part/size 옵션이 삭제됨 → 배달 기본 S·M 선택 불가
--
-- 기준 템플릿: C001 SOY SAUCE CHICKEN (없으면 part+sidedish+ M 옵션이 있는 첫 치킨)
-- Supreme(C002) 은 pos_menu_fix_supreme_chicken_delivery_options.sql 만 사용

-- 0) 현재 상태
select
  m.code,
  m.name,
  m.option_selection_groups,
  m.option_selection_config,
  o.name as option_name,
  o.option_step_values,
  o.sell_hall,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id and coalesce(o.option_type, 'substitution') = 'substitution'
where lower(trim(coalesce(m.code, ''))) = 'c005'
order by o.sort_order, o.name;

-- 1) 템플릿 메뉴에서 option_selection_groups / config 복사
with
target as (
  select id, code, name
  from public.pos_menus
  where lower(trim(coalesce(code, ''))) = 'c005'
  limit 1
),
ref as (
  select id, code, name, option_selection_groups, option_selection_config
  from public.pos_menus
  where lower(trim(coalesce(code, ''))) = 'c001'
    and lower(trim(coalesce(name, ''))) like '%soy sauce%chicken%'
    and lower(trim(coalesce(name, ''))) not like '%spring%onion%'
  limit 1
),
ref_fallback as (
  select m.id, m.code, m.name, m.option_selection_groups, m.option_selection_config
  from public.pos_menus m
  where exists (
    select 1
    from public.pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
      and trim(coalesce(o.name, '')) = 'M - Boneless'
  )
  and exists (
    select 1
    from jsonb_array_elements_text(coalesce(m.option_selection_groups, '[]'::jsonb)) g
    where lower(trim(g)) = 'part'
  )
  and lower(trim(coalesce(m.code, ''))) ~ '^c[0-9]{3}$'
  and lower(trim(coalesce(m.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023')
  order by m.code
  limit 1
),
picked as (
  select * from ref
  union all
  select * from ref_fallback
  where not exists (select 1 from ref)
  limit 1
)
update public.pos_menus t
set
  option_selection_groups = coalesce(p.option_selection_groups, '["part","sidedish"]'::jsonb),
  option_selection_config = coalesce(
    p.option_selection_config,
    jsonb_build_array(
      jsonb_build_object('key', 'part', 'label', 'part', 'audience', 'all', 'required', true, 'minSelect', 1, 'maxSelect', 1),
      jsonb_build_object('key', 'sidedish', 'label', 'sidedish', 'audience', 'all', 'required', false, 'minSelect', 0, 'maxSelect', 1)
    )
  )
from target tg
cross join picked p
where t.id = tg.id;

-- 2) 템플릿 substitution 옵션 복사 (이름 기준 — Kimchi 등 기존 행은 유지)
with
target as (
  select id, code from public.pos_menus where lower(trim(code)) = 'c005' limit 1
),
ref as (
  select id from public.pos_menus
  where lower(trim(code)) = 'c001'
    and lower(trim(coalesce(name, ''))) like '%soy sauce%chicken%'
    and lower(trim(coalesce(name, ''))) not like '%spring%onion%'
  limit 1
),
ref_fallback as (
  select m.id
  from public.pos_menus m
  where exists (
    select 1 from public.pos_menu_options o
    where o.menu_id = m.id and trim(coalesce(o.name, '')) = 'M - Boneless'
  )
  and lower(trim(coalesce(m.code, ''))) ~ '^c[0-9]{3}$'
  and lower(trim(m.code)) not in ('c002', 'c005', 'c020', 'c021', 'c022', 'c023')
  order by m.code
  limit 1
),
picked as (
  select id from ref
  union all
  select id from ref_fallback where not exists (select 1 from ref)
  limit 1
)
insert into public.pos_menu_options (
  menu_id,
  name,
  price_modifier,
  price_modifier_delivery,
  price_modifier_packaging,
  sort_order,
  option_type,
  option_step_values,
  sell_hall,
  sell_delivery,
  sell_packaging
)
select
  tg.id,
  trim(o.name),
  coalesce(o.price_modifier, 0),
  o.price_modifier_delivery,
  o.price_modifier_packaging,
  coalesce(o.sort_order, 0),
  coalesce(o.option_type, 'substitution'),
  o.option_step_values,
  coalesce(o.sell_hall, true),
  coalesce(o.sell_delivery, true),
  coalesce(o.sell_packaging, true)
from picked p
join public.pos_menu_options o on o.menu_id = p.id
cross join target tg
where coalesce(o.option_type, 'substitution') = 'substitution'
  and trim(coalesce(o.name, '')) <> ''
  and not exists (
    select 1
    from public.pos_menu_options x
    where x.menu_id = tg.id
      and lower(trim(coalesce(x.name, ''))) = lower(trim(coalesce(o.name, '')))
  );

-- 3) part / sidedish option_step_values 보정 (이름 기준)
with cfg as (
  select m.id as menu_id
  from public.pos_menus m
  where lower(trim(coalesce(m.code, ''))) = 'c005'
),
patch as (
  select
    o.id,
    case
      when trim(coalesce(o.name, '')) ~* '^(s\s*[-–—]?\s*)?(순살|boneless)\s*$' then null
      when trim(coalesce(o.name, '')) ilike 'M - Boneless%'
        or trim(coalesce(o.name, '')) ilike '%boneless%'
        or trim(coalesce(o.name, '')) ilike '%순살%' then jsonb_build_object('part', 'Boneless')
      when trim(coalesce(o.name, '')) ilike 'M - Wing%'
        or trim(coalesce(o.name, '')) ilike '%wing%'
        or trim(coalesce(o.name, '')) ilike '%윙%' then jsonb_build_object('part', 'Wing')
      when trim(coalesce(o.name, '')) ilike 'M - Drumette%'
        or trim(coalesce(o.name, '')) ilike '%drumette%'
        or trim(coalesce(o.name, '')) ilike '%봉%' then jsonb_build_object('part', 'Drumette')
      when trim(coalesce(o.name, '')) ~* '(kimchi|pickled|radish|단무|김치|ไช)'
        then jsonb_build_object('sidedish', trim(coalesce(o.name, '')))
      else null
    end as step_json
  from public.pos_menu_options o
  join cfg c on c.menu_id = o.menu_id
  where coalesce(o.option_type, 'substitution') = 'substitution'
)
update public.pos_menu_options o
set option_step_values = p.step_json
from patch p
where o.id = p.id
  and p.step_json is not null
  and (
    o.option_step_values is null
    or o.option_step_values = 'null'::jsonb
    or trim(coalesce(o.option_step_values::text, '')) in ('', '{}')
    or o.option_step_values is distinct from p.step_json
  );

-- 4) part / sidedish 공통 그룹 링크 복사 (템플릿 → C005, 없을 때만)
do $$
declare
  v_target_id bigint;
  v_ref_id bigint;
begin
  if to_regclass('public.pos_menu_option_group_links') is null
     or to_regclass('public.pos_option_groups') is null then
    return;
  end if;

  select id into v_target_id from public.pos_menus where lower(trim(code)) = 'c005' limit 1;
  if v_target_id is null then return; end if;

  select id into v_ref_id
  from public.pos_menus
  where lower(trim(code)) = 'c001'
    and lower(trim(coalesce(name, ''))) like '%soy sauce%chicken%'
    and lower(trim(coalesce(name, ''))) not like '%spring%onion%'
  limit 1;

  if v_ref_id is null then
    select m.id into v_ref_id
    from public.pos_menus m
    where exists (
      select 1 from public.pos_menu_options o
      where o.menu_id = m.id and trim(coalesce(o.name, '')) = 'M - Boneless'
    )
    and lower(trim(coalesce(m.code, ''))) ~ '^c[0-9]{3}$'
    and lower(trim(m.code)) not in ('c002', 'c005', 'c020', 'c021', 'c022', 'c023')
    order by m.code
    limit 1;
  end if;

  if v_ref_id is null then return; end if;

  insert into public.pos_menu_option_group_links (menu_id, group_id, sort_order, required, min_select, max_select)
  select
    v_target_id,
    l.group_id,
    l.sort_order,
    l.required,
    l.min_select,
    l.max_select
  from public.pos_menu_option_group_links l
  join public.pos_option_groups g on g.id = l.group_id
  where l.menu_id = v_ref_id
    and lower(trim(coalesce(g.group_key, ''))) in ('part', 'sidedish')
    and not exists (
      select 1
      from public.pos_menu_option_group_links x
      where x.menu_id = v_target_id and x.group_id = l.group_id
    );
end $$;

-- 5) 적용 후 (C005 — M - Boneless 등 + Kimchi 있어야 함)
select
  m.code,
  m.name,
  m.option_selection_groups,
  m.option_selection_config,
  o.name as option_name,
  o.option_step_values,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id and coalesce(o.option_type, 'substitution') = 'substitution'
where lower(trim(coalesce(m.code, ''))) = 'c005'
order by o.sort_order, o.name;
