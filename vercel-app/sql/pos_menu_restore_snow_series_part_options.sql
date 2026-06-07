-- SNOW 시리즈 part 옵션 복구 (SNOW ONION / HOT SNOW ONION / CURRY SNOW ONION 등)
-- 증상: 배달 POS에서 「기본 S Boneless」+ 「M - Joint Wing」만 보임
-- 조치: C011 GOLDEN FRIED CHICKEN 기준으로 part(M) 옵션·단계 복사
-- 제외: Supreme(C002), BBQ(C020~C023)
--
-- 실행: 0) 확인 → 1)~4) 순서대로 → 5) 확인 (재실행 가능)

-- ─────────────────────────────────────────────────────────────
-- 0) 적용 전
-- ─────────────────────────────────────────────────────────────
select
  m.code,
  m.name,
  m.category,
  m.option_selection_groups,
  o.name as option_name,
  o.option_step_values,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id
 and coalesce(o.option_type, 'substitution') = 'substitution'
where (
  lower(trim(coalesce(m.category, ''))) = 'snow'
  or (
    lower(trim(coalesce(m.category_main, ''))) = 'chicken'
    and lower(trim(coalesce(m.name, ''))) like '%snow%onion%'
  )
)
and lower(trim(coalesce(m.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023')
order by m.code, o.sort_order nulls last, o.name;

-- ─────────────────────────────────────────────────────────────
-- 1) option_selection_groups / config — C011 과 동일하게
-- ─────────────────────────────────────────────────────────────
with
ref as (
  select id, option_selection_groups, option_selection_config
  from public.pos_menus
  where lower(trim(coalesce(code, ''))) = 'c011'
  limit 1
),
ref_fallback as (
  select m.id, m.option_selection_groups, m.option_selection_config
  from public.pos_menus m
  where lower(trim(coalesce(m.code, ''))) ~ '^c[0-9]{3}$'
    and lower(trim(m.code)) not in ('c002', 'c020', 'c021', 'c022', 'c023')
    and exists (
      select 1
      from public.pos_menu_options o
      where o.menu_id = m.id
        and trim(coalesce(o.name, '')) = 'M - Boneless'
    )
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
  option_selection_groups = coalesce(
    p.option_selection_groups,
    '["part","sidedish"]'::jsonb
  ),
  option_selection_config = coalesce(
    p.option_selection_config,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'part', 'label', 'part', 'audience', 'all',
        'required', true, 'minSelect', 1, 'maxSelect', 1
      ),
      jsonb_build_object(
        'key', 'sidedish', 'label', 'sidedish', 'audience', 'all',
        'required', false, 'minSelect', 0, 'maxSelect', 1
      )
    )
  )
from picked p
where (
  lower(trim(coalesce(t.category, ''))) = 'snow'
  or (
    lower(trim(coalesce(t.category_main, ''))) = 'chicken'
    and lower(trim(coalesce(t.name, ''))) like '%snow%onion%'
  )
)
and lower(trim(coalesce(t.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023');

-- ─────────────────────────────────────────────────────────────
-- 2) part substitution 복사 (M - Boneless / Wing / Drumette)
--    Kimchi·Joint Wing 등 기존 행은 이름 중복 시 건너뜀
-- ─────────────────────────────────────────────────────────────
with
snow as (
  select id, code
  from public.pos_menus m
  where (
    lower(trim(coalesce(m.category, ''))) = 'snow'
    or (
      lower(trim(coalesce(m.category_main, ''))) = 'chicken'
      and lower(trim(coalesce(m.name, ''))) like '%snow%onion%'
    )
  )
  and lower(trim(coalesce(m.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023')
),
ref as (
  select id from public.pos_menus where lower(trim(code)) = 'c011' limit 1
),
ref_fallback as (
  select m.id
  from public.pos_menus m
  where lower(trim(m.code)) ~ '^c[0-9]{3}$'
    and lower(trim(m.code)) not in ('c002', 'c020', 'c021', 'c022', 'c023')
    and exists (
      select 1 from public.pos_menu_options o
      where o.menu_id = m.id and trim(coalesce(o.name, '')) = 'M - Boneless'
    )
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
  s.id,
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
cross join snow s
where coalesce(o.option_type, 'substitution') = 'substitution'
  and trim(coalesce(o.name, '')) in ('M - Boneless', 'M - Wing', 'M - Drumette')
  and not exists (
    select 1
    from public.pos_menu_options x
    where x.menu_id = s.id
      and lower(trim(coalesce(x.name, ''))) = lower(trim(coalesce(o.name, '')))
  );

-- ─────────────────────────────────────────────────────────────
-- 3) option_step_values 보정 (part / sidedish / Joint Wing)
-- ─────────────────────────────────────────────────────────────
with snow as (
  select m.id as menu_id
  from public.pos_menus m
  where (
    lower(trim(coalesce(m.category, ''))) = 'snow'
    or (
      lower(trim(coalesce(m.category_main, ''))) = 'chicken'
      and lower(trim(coalesce(m.name, ''))) like '%snow%onion%'
    )
  )
  and lower(trim(coalesce(m.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023')
),
patch as (
  select
    o.id,
    case
      when trim(coalesce(o.name, '')) ilike 'M - Boneless%'
        then jsonb_build_object('part', 'Boneless')
      when trim(coalesce(o.name, '')) ilike 'M - Wing%'
        or trim(coalesce(o.name, '')) ~* '^m\s*[-–—]\s*joint\s*wing'
        then jsonb_build_object('part', 'Wing')
      when trim(coalesce(o.name, '')) ilike 'M - Drumette%'
        then jsonb_build_object('part', 'Drumette')
      when trim(coalesce(o.name, '')) ~* '(kimchi|pickled|radish|단무|김치|ไช)'
        then jsonb_build_object('sidedish', trim(coalesce(o.name, '')))
      else null
    end as step_json
  from public.pos_menu_options o
  join snow s on s.menu_id = o.menu_id
  where coalesce(o.option_type, 'substitution') = 'substitution'
)
update public.pos_menu_options o
set option_step_values = p.step_json
from patch p
where o.id = p.id
  and p.step_json is not null;

-- ─────────────────────────────────────────────────────────────
-- 4) part / sidedish 공통 그룹 링크 복사 (테이블 있을 때만)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  v_ref_id bigint;
  v_menu_id bigint;
begin
  if to_regclass('public.pos_menu_option_group_links') is null
     or to_regclass('public.pos_option_groups') is null then
    return;
  end if;

  select id into v_ref_id
  from public.pos_menus
  where lower(trim(code)) = 'c011'
  limit 1;

  if v_ref_id is null then
    return;
  end if;

  for v_menu_id in
    select m.id
    from public.pos_menus m
    where (
      lower(trim(coalesce(m.category, ''))) = 'snow'
      or (
        lower(trim(coalesce(m.category_main, ''))) = 'chicken'
        and lower(trim(coalesce(m.name, ''))) like '%snow%onion%'
      )
    )
    and lower(trim(coalesce(m.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023')
  loop
    insert into public.pos_menu_option_group_links (
      menu_id, group_id, sort_order, required, min_select, max_select
    )
    select
      v_menu_id,
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
        where x.menu_id = v_menu_id
          and x.group_id = l.group_id
      );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5) 적용 후 (메뉴별 M - Boneless / Wing / Drumette + 사이드 확인)
-- ─────────────────────────────────────────────────────────────
select
  m.code,
  m.name,
  m.option_selection_groups,
  o.name as option_name,
  o.option_step_values,
  o.sell_delivery
from public.pos_menus m
left join public.pos_menu_options o
  on o.menu_id = m.id
 and coalesce(o.option_type, 'substitution') = 'substitution'
where (
  lower(trim(coalesce(m.category, ''))) = 'snow'
  or (
    lower(trim(coalesce(m.category_main, ''))) = 'chicken'
    and lower(trim(coalesce(m.name, ''))) like '%snow%onion%'
  )
)
and lower(trim(coalesce(m.code, ''))) not in ('c002', 'c020', 'c021', 'c022', 'c023')
order by m.code, o.sort_order nulls last, o.name;
