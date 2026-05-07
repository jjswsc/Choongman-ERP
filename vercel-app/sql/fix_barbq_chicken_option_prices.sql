-- Bar.B.Q 치킨 옵션가 강제 복구 (문자열 변형/구버전 스키마 호환)
-- 핵심:
-- 1) Bar.B.Q 계열 카테고리(문자열 변형 포함) 치킨 메뉴를 자동 탐지
-- 2) 홀 옵션가가 0이고 배달/포장 값이 있으면 홀값으로 복사
-- 3) 그래도 0인 값은 같은 옵션명의 대표값(평균)으로 보정

alter table if exists public.pos_menu_options
  add column if not exists price_modifier_delivery numeric;

alter table if exists public.pos_menu_options
  add column if not exists price_modifier_packaging numeric;

-- 0) 대상 메뉴 점검 (카테고리 문자열 변형 허용)
with target_menus as (
  select id, code, name, category, category_main
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
)
select id, code, name, category, category_main
from target_menus
order by code, id;

-- 1) 적용 전 옵션 상태
with target_menus as (
  select id
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
)
select
  m.category,
  m.code,
  m.name as menu_name,
  o.name as option_name,
  o.price_modifier,
  o.price_modifier_delivery,
  o.price_modifier_packaging
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where o.menu_id in (select id from target_menus)
  and coalesce(o.option_type, 'substitution') = 'substitution'
order by m.code, o.sort_order, o.name;

begin;

-- 2) 홀값(기본)이 0이고 배달/포장에 값이 있으면 홀값으로 복사
with target_menus as (
  select id
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
)
update pos_menu_options o
set price_modifier = coalesce(o.price_modifier_delivery, o.price_modifier_packaging, o.price_modifier)
where o.menu_id in (select id from target_menus)
  and coalesce(o.option_type, 'substitution') = 'substitution'
  and coalesce(o.price_modifier, 0) = 0
  and (
    coalesce(o.price_modifier_delivery, 0) <> 0
    or coalesce(o.price_modifier_packaging, 0) <> 0
  );

-- 3) 같은 옵션명 기준 대표값(평균)으로 0 값을 보정
with option_ref as (
  select
    o.name,
    round(avg(nullif(o.price_modifier, 0))::numeric, 2) as avg_hall,
    round(avg(nullif(o.price_modifier_delivery, 0))::numeric, 2) as avg_delivery,
    round(avg(nullif(o.price_modifier_packaging, 0))::numeric, 2) as avg_packaging
  from pos_menu_options o
  join pos_menus m on m.id = o.menu_id
  where coalesce(m.category_main, '') = 'Chicken'
    and (
      coalesce(m.category, '') ilike '%bar%b%q%'
      or coalesce(m.category, '') ilike '%bar.b.q%'
      or coalesce(m.category, '') ilike '%bbq%'
    )
    and coalesce(o.option_type, 'substitution') = 'substitution'
    and trim(coalesce(o.name, '')) <> ''
  group by o.name
)
update pos_menu_options o
set
  price_modifier = case
    when coalesce(o.price_modifier, 0) = 0 then coalesce(r.avg_hall, o.price_modifier)
    else o.price_modifier
  end,
  price_modifier_delivery = case
    when coalesce(o.price_modifier_delivery, 0) = 0 then coalesce(r.avg_delivery, o.price_modifier_delivery)
    else o.price_modifier_delivery
  end,
  price_modifier_packaging = case
    when coalesce(o.price_modifier_packaging, 0) = 0 then coalesce(r.avg_packaging, o.price_modifier_packaging)
    else o.price_modifier_packaging
  end
from option_ref r
where o.name = r.name
  and o.menu_id in (
    select id
    from pos_menus
    where coalesce(category_main, '') = 'Chicken'
      and (
        coalesce(category, '') ilike '%bar%b%q%'
        or coalesce(category, '') ilike '%bar.b.q%'
        or coalesce(category, '') ilike '%bbq%'
      )
  )
  and coalesce(o.option_type, 'substitution') = 'substitution';

commit;

-- 5) CURRY/GARLIC(C022/C023) 옵션 3종 강제 보장
--    (운영 이슈: 특정 메뉴에서 M-Boneless만 남고 Wing/Drumette가 누락되는 케이스 복구)
begin;

alter table if exists public.pos_menu_options
  add column if not exists option_step_values jsonb;
alter table if exists public.pos_menu_options
  add column if not exists sell_hall boolean default true;
alter table if exists public.pos_menu_options
  add column if not exists sell_delivery boolean default true;
alter table if exists public.pos_menu_options
  add column if not exists sell_packaging boolean default true;

with target as (
  select id, code
  from pos_menus
  where code in ('C022', 'C023')
),
required_opts as (
  select
    t.id as menu_id,
    t.code,
    v.name,
    v.sort_order,
    jsonb_build_object('size', 'M', 'part', v.part_key) as step_json
  from target t
  cross join (
    values
      ('M - Boneless', 0, 'Boneless'),
      ('M - Wing', 1, 'Wing'),
      ('M - Drumette', 2, 'Drumette')
  ) as v(name, sort_order, part_key)
)
insert into pos_menu_options (
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
  r.menu_id,
  r.name,
  90,
  100,
  null,
  r.sort_order,
  'substitution',
  r.step_json,
  true,
  true,
  true
from required_opts r
where not exists (
  select 1
  from pos_menu_options o
  where o.menu_id = r.menu_id
    and coalesce(o.option_type, 'substitution') = 'substitution'
    and (
      trim(coalesce(o.name, '')) = r.name
      or (
        o.option_step_values is not null
        and o.option_step_values ->> 'size' = 'M'
        and o.option_step_values ->> 'part' = r.step_json ->> 'part'
      )
    )
);

-- 기존 3종에 step/sell 값이 빠진 경우 보정
update pos_menu_options o
set
  option_type = 'substitution',
  option_step_values = coalesce(
    o.option_step_values,
    case
      when trim(coalesce(o.name, '')) = 'M - Boneless' then jsonb_build_object('size', 'M', 'part', 'Boneless')
      when trim(coalesce(o.name, '')) = 'M - Wing' then jsonb_build_object('size', 'M', 'part', 'Wing')
      when trim(coalesce(o.name, '')) = 'M - Drumette' then jsonb_build_object('size', 'M', 'part', 'Drumette')
      else null
    end
  ),
  sell_hall = coalesce(o.sell_hall, true),
  sell_delivery = coalesce(o.sell_delivery, true),
  sell_packaging = coalesce(o.sell_packaging, true),
  price_modifier = case when coalesce(o.price_modifier, 0) = 0 then 90 else o.price_modifier end,
  price_modifier_delivery = coalesce(o.price_modifier_delivery, 100)
from pos_menus m
where o.menu_id = m.id
  and m.code in ('C022', 'C023')
  and trim(coalesce(o.name, '')) in ('M - Boneless', 'M - Wing', 'M - Drumette');

commit;

-- 6) C022/C023만 2단계(1/2)로 보이는 현상 해제
--    - 원인: pos_menus.option_selection_groups = ['size','part'] 로 설정됨
--    - 조치: 해당 2메뉴는 그룹 설정을 비워 다른 Bar.B.Q 메뉴와 동일한 "직접 옵션 선택" UI로 통일
begin;

alter table if exists public.pos_menus
  add column if not exists option_selection_groups jsonb;

update pos_menus
set
  option_selection_groups = null,
  option_selection_config = null
where code in ('C022', 'C023');

commit;

-- 4) 적용 후 옵션 상태
with target_menus as (
  select id
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
)
select
  m.category,
  m.code,
  m.name as menu_name,
  o.name as option_name,
  o.price_modifier,
  o.price_modifier_delivery,
  o.price_modifier_packaging
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where o.menu_id in (select id from target_menus)
  and coalesce(o.option_type, 'substitution') = 'substitution'
order by m.code, o.sort_order, o.name;
