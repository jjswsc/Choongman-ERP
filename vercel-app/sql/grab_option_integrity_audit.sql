-- Grab 옵션 정합성 전수 점검
-- 목적: Grab 메뉴 동기화/주문 매핑에서 옵션 오류를 일으킬 수 있는 데이터 탐지

-- A) 프로모 구성: option_id 고아 / 메뉴-옵션 불일치
select
  'promo_item_option_orphan' as check_name,
  count(*) as row_count
from pos_promo_items pi
left join pos_menu_options o on o.id = pi.option_id
where pi.option_id is not null
  and o.id is null
union all
select
  'promo_item_option_menu_mismatch' as check_name,
  count(*) as row_count
from pos_promo_items pi
join pos_menu_options o on o.id = pi.option_id
where pi.option_id is not null
  and o.menu_id <> pi.menu_id
order by check_name;

-- B) 상세 목록 (문제행)
select
  pi.id as promo_item_id,
  pi.promo_id,
  pp.code as promo_code,
  pp.name as promo_name,
  pi.menu_id,
  pm.code as menu_code,
  pi.option_id,
  o.menu_id as option_menu_id,
  o.option_code,
  o.name as option_name,
  case
    when pi.option_id is null then 'ok_no_option'
    when o.id is null then 'broken_option_id'
    when o.menu_id <> pi.menu_id then 'menu_option_mismatch'
    else 'ok'
  end as status
from pos_promo_items pi
join pos_promos pp on pp.id = pi.promo_id
left join pos_menus pm on pm.id = pi.menu_id
left join pos_menu_options o on o.id = pi.option_id
where (pi.option_id is not null and (o.id is null or o.menu_id <> pi.menu_id))
order by pi.promo_id, pi.id;

-- C) Grab export 대상 옵션 코드 무결성
--    (sell_delivery=true 옵션만 실제 Grab 메뉴 modifier로 내려감)
select
  'grab_delivery_option_blank_code' as check_name,
  count(*) as row_count
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where coalesce(m.is_active, true) = true
  and coalesce(o.sell_delivery, true) = true
  and trim(coalesce(o.option_code, '')) = ''
union all
select
  'grab_delivery_option_code_prefix_mismatch' as check_name,
  count(*) as row_count
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where coalesce(m.is_active, true) = true
  and coalesce(o.sell_delivery, true) = true
  and trim(coalesce(o.option_code, '')) <> ''
  and split_part(trim(o.option_code), '-', 1) <> trim(coalesce(m.code, ''))
order by check_name;

-- D) Grab 메뉴 알림 대상 통합 상태 (테이블 없으면 안내)
drop table if exists _grab_integration_status;
create temporary table _grab_integration_status (
  integration_status text,
  row_count bigint
);

do $$
begin
  if to_regclass('public.pos_grab_store_integrations') is not null then
    execute '
      insert into _grab_integration_status (integration_status, row_count)
      select integration_status::text, count(*)::bigint
      from public.pos_grab_store_integrations
      group by integration_status
      order by integration_status
    ';
  else
    insert into _grab_integration_status (integration_status, row_count)
    values ('table_missing:public.pos_grab_store_integrations', 0);
  end if;
end $$;

select * from _grab_integration_status order by integration_status;

-- =========================================================
-- E) 프로모 선택 그룹(choice_group) — 세트 N개 중 M개 선택
-- =========================================================
with promo_choice_groups as (
  select
    pi.promo_id,
    trim(pi.choice_group) as choice_group,
    count(*)::int as candidate_cnt,
    max(coalesce(pi.choice_pick_count, 1))::int as max_pick,
    min(coalesce(pi.choice_pick_count, 1))::int as min_pick,
    count(distinct coalesce(pi.choice_pick_count, 1))::int as distinct_pick_values
  from pos_promo_items pi
  where trim(coalesce(pi.choice_group, '')) <> ''
  group by pi.promo_id, trim(pi.choice_group)
)
select
  'promo_choice_group_pick_exceeds_candidates' as check_name,
  count(*)::bigint as row_count
from promo_choice_groups
where max_pick > candidate_cnt
union all
select
  'promo_choice_group_pick_count_inconsistent' as check_name,
  count(*)::bigint as row_count
from promo_choice_groups
where distinct_pick_values > 1
union all
select
  'promo_choice_group_option_menu_mismatch' as check_name,
  count(*)::bigint as row_count
from pos_promo_items pi
join pos_menu_options o on o.id = pi.option_id
where trim(coalesce(pi.choice_group, '')) <> ''
  and pi.option_id is not null
  and o.menu_id <> pi.menu_id
union all
select
  'promo_choice_group_pick_without_group_key' as check_name,
  count(*)::bigint as row_count
from pos_promo_items pi
where trim(coalesce(pi.choice_group, '')) = ''
  and pi.choice_pick_count is not null
  and pi.choice_pick_count > 1
order by check_name;

-- E-2) 프로모 선택 그룹 상세 (문제행만)
with promo_choice_groups as (
  select
    pi.promo_id,
    trim(pi.choice_group) as choice_group,
    count(*)::int as candidate_cnt,
    max(coalesce(pi.choice_pick_count, 1))::int as max_pick,
    min(coalesce(pi.choice_pick_count, 1))::int as min_pick,
    count(distinct coalesce(pi.choice_pick_count, 1))::int as distinct_pick_values
  from pos_promo_items pi
  where trim(coalesce(pi.choice_group, '')) <> ''
  group by pi.promo_id, trim(pi.choice_group)
)
select
  pp.code as promo_code,
  pp.name as promo_name,
  g.promo_id,
  g.choice_group,
  g.candidate_cnt,
  g.min_pick,
  g.max_pick,
  g.distinct_pick_values,
  case
    when g.max_pick > g.candidate_cnt then 'pick_exceeds_candidates'
    when g.distinct_pick_values > 1 then 'pick_count_inconsistent'
    else 'ok'
  end as status
from promo_choice_groups g
join pos_promos pp on pp.id = g.promo_id
where g.max_pick > g.candidate_cnt
   or g.distinct_pick_values > 1
order by pp.code, g.choice_group;

-- =========================================================
-- F) 메뉴 옵션 단계 그룹 — Grab/POS 빈 모달 위험
--   (활성 메뉴 + option_selection_config 키 있는데 substitution 옵션 0건)
-- =========================================================
select
  'menu_option_groups_without_substitution_options' as check_name,
  count(*)::bigint as row_count
from pos_menus m
where coalesce(m.is_active, true) = true
  and exists (
    select 1
    from lateral (
      select jsonb_array_elements(
        case
          when m.option_selection_config is null then '[]'::jsonb
          when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
          else '[]'::jsonb
        end
      ) as elem
    ) c
    where trim(coalesce(c.elem->>'key', '')) <> ''
  )
  and not exists (
    select 1
    from pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  );

-- F-2) 메뉴 옵션 단계 키 vs substitution option_step_values 불일치 (활성 메뉴)
with menu_groups as (
  select
    m.id as menu_id,
    m.code as menu_code,
    m.name as menu_name,
    array_agg(distinct lower(trim(g.key))) filter (where trim(g.key) <> '') as group_keys
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
  where coalesce(m.is_active, true) = true
  group by m.id, m.code, m.name
),
step_keys as (
  select
    o.menu_id,
    array_agg(distinct lower(trim(k.key))) filter (where trim(k.key) <> '') as option_step_keys
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
    and coalesce(o.sell_delivery, true) = true
  group by o.menu_id
)
select
  'menu_option_group_key_no_delivery_step_match' as check_name,
  count(*)::bigint as row_count
from menu_groups mg
left join step_keys sk on sk.menu_id = mg.menu_id
where coalesce(array_length(mg.group_keys, 1), 0) > 0
  and (
    coalesce(array_length(sk.option_step_keys, 1), 0) = 0
    or not exists (
      select 1
      from unnest(mg.group_keys) gk
      join unnest(coalesce(sk.option_step_keys, '{}'::text[])) skk on gk = skk
    )
  );

-- F-3) 상세 (F/F-2 문제 메뉴)
select
  m.id,
  m.code,
  m.name,
  'groups_without_substitution' as issue
from pos_menus m
where coalesce(m.is_active, true) = true
  and exists (
    select 1
    from lateral (
      select jsonb_array_elements(
        case
          when m.option_selection_config is null then '[]'::jsonb
          when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
          else '[]'::jsonb
        end
      ) as elem
    ) c
    where trim(coalesce(c.elem->>'key', '')) <> ''
  )
  and not exists (
    select 1
    from pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  )
order by m.code, m.id;

-- =========================================================
-- G) Grab 배달용 substitution — 단계별 후보 0건 (required 그룹 위험)
-- =========================================================
with menu_cfg as (
  select
    m.id as menu_id,
    m.code as menu_code,
    lower(trim(c.elem->>'key')) as step_key,
    coalesce((c.elem->>'required')::boolean, false) as required,
    greatest(1, coalesce(nullif(trim(c.elem->>'maxSelect'), '')::int, 1)) as max_select
  from pos_menus m
  cross join lateral jsonb_array_elements(
    case
      when m.option_selection_config is null then '[]'::jsonb
      when jsonb_typeof(m.option_selection_config::jsonb) = 'array' then m.option_selection_config::jsonb
      else '[]'::jsonb
    end
  ) as c(elem)
  where coalesce(m.is_active, true) = true
    and trim(coalesce(c.elem->>'key', '')) <> ''
    and coalesce(lower(trim(c.elem->>'audience')), 'all') in ('all', 'delivery')
),
step_candidates as (
  select
    o.menu_id,
    lower(trim(k.key)) as step_key,
    count(*)::int as delivery_option_cnt
  from pos_menu_options o
  cross join lateral jsonb_object_keys(
    case
      when o.option_step_values is null then '{}'::jsonb
      when jsonb_typeof(o.option_step_values::jsonb) = 'object' then o.option_step_values::jsonb
      else '{}'::jsonb
    end
  ) as k(key)
  where coalesce(o.option_type, 'substitution') = 'substitution'
    and coalesce(o.sell_delivery, true) = true
    and trim(coalesce(o.option_code, '')) <> ''
  group by o.menu_id, lower(trim(k.key))
)
select
  'grab_required_step_zero_delivery_candidates' as check_name,
  count(*)::bigint as row_count
from menu_cfg mc
left join step_candidates sc
  on sc.menu_id = mc.menu_id and sc.step_key = mc.step_key
where mc.required = true
  and coalesce(sc.delivery_option_cnt, 0) = 0
union all
select
  'grab_step_max_select_exceeds_candidates' as check_name,
  count(*)::bigint as row_count
from menu_cfg mc
left join step_candidates sc
  on sc.menu_id = mc.menu_id and sc.step_key = mc.step_key
where coalesce(sc.delivery_option_cnt, 0) > 0
  and mc.max_select > sc.delivery_option_cnt
order by check_name;

-- =========================================================
-- H) 전역 옵션그룹 링크 (pos_menu_option_group_links 있을 때)
-- =========================================================
drop table if exists _grab_master_group_checks;
create temporary table _grab_master_group_checks (
  check_name text primary key,
  row_count bigint
);

do $$
begin
  if to_regclass('public.pos_menu_option_group_links') is null
     or to_regclass('public.pos_option_groups') is null
     or to_regclass('public.pos_option_group_items') is null then
    insert into _grab_master_group_checks (check_name, row_count)
    values ('master_group_tables_missing', 0);
    return;
  end if;

  execute $sql$
    insert into _grab_master_group_checks (check_name, row_count)
    select 'master_group_link_orphan_group', count(*)::bigint
    from public.pos_menu_option_group_links l
    left join public.pos_option_groups g on g.id = l.group_id
    where g.id is null
    union all
    select 'master_group_link_orphan_menu', count(*)::bigint
    from public.pos_menu_option_group_links l
    left join public.pos_menus m on m.id = l.menu_id
    where m.id is null
    union all
    select 'master_group_delivery_link_no_delivery_items', count(*)::bigint
    from public.pos_menu_option_group_links l
    join public.pos_option_groups g on g.id = l.group_id
    where coalesce(l.sell_delivery, true) = true
      and coalesce(g.is_active, true) = true
      and coalesce(
        (
          select count(*)::int
          from public.pos_option_group_items i
          where i.group_id = l.group_id
            and coalesce(i.sell_delivery, true) = true
        ),
        0
      ) = 0
    union all
    select 'master_group_delivery_max_select_exceeds_items', count(*)::bigint
    from public.pos_menu_option_group_links l
    join public.pos_option_groups g on g.id = l.group_id
    cross join lateral (
      select count(*)::int as item_cnt
      from public.pos_option_group_items i
      where i.group_id = l.group_id
        and coalesce(i.sell_delivery, true) = true
    ) ic
    where coalesce(l.sell_delivery, true) = true
      and coalesce(g.is_active, true) = true
      and ic.item_cnt > 0
      and greatest(1, coalesce(l.max_select, 1)) > ic.item_cnt
  $sql$;
end $$;

select * from _grab_master_group_checks order by check_name;
