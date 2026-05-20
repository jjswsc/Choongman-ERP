-- 일반 치킨(C001~C019 등, C020~C023 Bar.B.Q 제외) option_step_values 보정
-- 증상: option_selection_config 에 part/sidedish 가 있는데 option_step_keys = []
-- 영향: Grab modifier 단계 매핑·DB 감사 F-2/D 불일치 (POS는 이름 추론으로 동작할 수 있음)
--
-- 규칙:
-- - M - Boneless / Wing / Drumette → {"part":"Boneless"|"Wing"|"Drumette"}
-- - 부위 컷이 아닌 substitution(김치·단무지 등) → {"sidedish":"<표시명>"} (메뉴에 sidedish 단계 있을 때)
-- - S 기본(순살/Boneless) 행은 스킵
-- - C020~C023 은 Bar.B.Q 전용 정책(pos_menu_fix_curry_garlic_barbq_option_ui.sql) — 여기서 제외

-- [1] 사전: 대상 메뉴·옵션 현황
with cfg as (
  select
    m.id as menu_id,
    m.code,
    m.name,
    coalesce(
      (
        select jsonb_agg(distinct lower(trim(c.elem->>'key')))
        from jsonb_array_elements(
          case
            when m.option_selection_config is null then '[]'::jsonb
            when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
            else '[]'::jsonb
          end
        ) c(elem)
        where trim(coalesce(c.elem->>'key', '')) <> ''
      ),
      '[]'::jsonb
    ) as group_keys
  from pos_menus m
  where coalesce(m.is_active, true) = true
    and trim(coalesce(m.code, '')) ~ '^C[0-9]{3}$'
    and trim(m.code) not in ('C020', 'C021', 'C022', 'C023')
)
select
  c.menu_id,
  c.code,
  c.name,
  c.group_keys,
  (
    select count(*)::int
    from pos_menu_options o
    where o.menu_id = c.menu_id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  ) as substitution_cnt,
  (
    select count(*)::int
    from pos_menu_options o
    where o.menu_id = c.menu_id
      and coalesce(o.option_type, 'substitution') = 'substitution'
      and exists (
        select 1
        from jsonb_object_keys(
          case
            when o.option_step_values is null then '{}'::jsonb
            when jsonb_typeof(o.option_step_values::jsonb) = 'object' then o.option_step_values::jsonb
            else '{}'::jsonb
          end
        ) k(key)
      )
  ) as options_with_step_keys
from cfg c
where c.group_keys ? 'part'
   or c.group_keys ? 'sidedish'
order by c.code;

-- [2] 보정 미리보기
with cfg as (
  select
    m.id as menu_id,
    m.code,
    coalesce(
      (
        select bool_or(lower(trim(c.elem->>'key')) = 'sidedish')
        from jsonb_array_elements(
          case
            when m.option_selection_config is null then '[]'::jsonb
            when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
            else '[]'::jsonb
          end
        ) c(elem)
      ),
      false
    ) as has_sidedish_step
  from pos_menus m
  where trim(coalesce(m.code, '')) ~ '^C[0-9]{3}$'
    and trim(m.code) not in ('C020', 'C021', 'C022', 'C023')
),
candidates as (
  select
    o.id,
    o.menu_id,
    c.code as menu_code,
    trim(coalesce(o.name, '')) as option_name,
    o.option_step_values as before_step,
    case
      when trim(coalesce(o.name, '')) ~* '^(S\s*[-–—]?\s*)?(순살|boneless)\s*$' then null
      when trim(coalesce(o.name, '')) ilike 'M - Boneless%'
        or trim(coalesce(o.name, '')) ilike '%boneless%'
        or trim(coalesce(o.name, '')) ilike '%순살%' then jsonb_build_object('part', 'Boneless')
      when trim(coalesce(o.name, '')) ilike 'M - Wing%'
        or trim(coalesce(o.name, '')) ilike '%wing%'
        or trim(coalesce(o.name, '')) ilike '%윙%' then jsonb_build_object('part', 'Wing')
      when trim(coalesce(o.name, '')) ilike 'M - Drumette%'
        or trim(coalesce(o.name, '')) ilike '%drumette%'
        or trim(coalesce(o.name, '')) ilike '%봉%' then jsonb_build_object('part', 'Drumette')
      when c.has_sidedish_step
        and trim(coalesce(o.name, '')) !~* '(boneless|순살|wing|윙|drumette|봉)'
        and trim(coalesce(o.name, '')) !~* '^\s*S\s*[-–—]?\s*(순살|boneless)\s*$'
        then jsonb_build_object('sidedish', trim(coalesce(o.name, '')))
      else null
    end as after_step
  from pos_menu_options o
  join cfg c on c.menu_id = o.menu_id
  where coalesce(o.option_type, 'substitution') = 'substitution'
)
select *
from candidates
where after_step is not null
  and (
    before_step is null
    or before_step = 'null'::jsonb
    or trim(coalesce(before_step::text, '')) in ('', '{}')
    or before_step is distinct from after_step
  )
order by menu_code, id;

-- [3] 적용
begin;

with cfg as (
  select
    m.id as menu_id,
    coalesce(
      (
        select bool_or(lower(trim(c.elem->>'key')) = 'sidedish')
        from jsonb_array_elements(
          case
            when m.option_selection_config is null then '[]'::jsonb
            when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
            else '[]'::jsonb
          end
        ) c(elem)
      ),
      false
    ) as has_sidedish_step
  from pos_menus m
  where trim(coalesce(m.code, '')) ~ '^C[0-9]{3}$'
    and trim(m.code) not in ('C020', 'C021', 'C022', 'C023')
),
patch as (
  select
    o.id,
    case
      when trim(coalesce(o.name, '')) ~* '^(S\s*[-–—]?\s*)?(순살|boneless)\s*$' then null
      when trim(coalesce(o.name, '')) ilike 'M - Boneless%'
        or trim(coalesce(o.name, '')) ilike '%boneless%'
        or trim(coalesce(o.name, '')) ilike '%순살%' then jsonb_build_object('part', 'Boneless')
      when trim(coalesce(o.name, '')) ilike 'M - Wing%'
        or trim(coalesce(o.name, '')) ilike '%wing%'
        or trim(coalesce(o.name, '')) ilike '%윙%' then jsonb_build_object('part', 'Wing')
      when trim(coalesce(o.name, '')) ilike 'M - Drumette%'
        or trim(coalesce(o.name, '')) ilike '%drumette%'
        or trim(coalesce(o.name, '')) ilike '%봉%' then jsonb_build_object('part', 'Drumette')
      when c.has_sidedish_step
        and trim(coalesce(o.name, '')) !~* '(boneless|순살|wing|윙|drumette|봉)'
        and trim(coalesce(o.name, '')) !~* '^\s*S\s*[-–—]?\s*(순살|boneless)\s*$'
        then jsonb_build_object('sidedish', trim(coalesce(o.name, '')))
      else null
    end as step_json
  from pos_menu_options o
  join cfg c on c.menu_id = o.menu_id
  where coalesce(o.option_type, 'substitution') = 'substitution'
)
update pos_menu_options o
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

commit;

-- [4] 사후: pos_menu_integrity_global_audit.sql 섹션 D 와 동일 조건 (0행 권장, C020~C023 제외)
with menu_groups as (
  select
    m.id as menu_id,
    m.code as menu_code,
    m.name as menu_name,
    array_agg(distinct trim(g.key)) filter (where trim(g.key) <> '') as groups
  from pos_menus m
  left join lateral (
    select jsonb_array_elements(
      case
        when m.option_selection_config is null then '[]'::jsonb
        when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
        else '[]'::jsonb
      end
    ) as elem
  ) c on true
  left join lateral (
    select coalesce(c.elem->>'key', '') as key
  ) g on true
  where trim(coalesce(m.code, '')) ~ '^C[0-9]{3}$'
    and trim(m.code) not in ('C020', 'C021', 'C022', 'C023')
  group by m.id, m.code, m.name
),
step_keys as (
  select
    o.menu_id,
    array_agg(distinct trim(k.key)) filter (where trim(k.key) <> '') as option_step_keys
  from pos_menu_options o
  left join lateral (
    select jsonb_object_keys(
      case
        when o.option_step_values is null then '{}'::jsonb
        when jsonb_typeof(o.option_step_values::jsonb) = 'object' then o.option_step_values::jsonb
        else '{}'::jsonb
      end
    ) as key
  ) k on true
  where coalesce(o.option_type, 'substitution') = 'substitution'
  group by o.menu_id
)
select
  mg.menu_id,
  mg.menu_code,
  mg.menu_name,
  mg.groups as configured_groups,
  coalesce(sk.option_step_keys, '{}'::text[]) as option_step_keys
from menu_groups mg
left join step_keys sk on sk.menu_id = mg.menu_id
where coalesce(array_length(mg.groups, 1), 0) > 0
  and (
    coalesce(array_length(sk.option_step_keys, 1), 0) = 0
    or not exists (
      select 1
      from unnest(mg.groups) g
      join unnest(coalesce(sk.option_step_keys, '{}'::text[])) s
        on lower(g) = lower(s)
    )
  )
order by mg.menu_code, mg.menu_id;
