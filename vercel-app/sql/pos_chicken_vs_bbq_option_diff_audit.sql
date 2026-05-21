-- Chicken vs Bar.B.Q 옵션 구조 차이 진단
-- 목적:
-- 1) 일반 치킨과 BBQ 치킨(C020~C023)의 차이가 DB 어디에서 시작되는지 한 번에 확인
-- 2) option_selection_groups / option_selection_config / option_step_values / 옵션명 패턴 비교
-- 3) UI가 갈라지는 원인(예: size/part 잔존, Wing/Drumette 잔존, M-옵션 패턴)을 데이터로 확인
--
-- 사용법:
-- - 아래 쿼리들을 위에서부터 순서대로 실행
-- - 본 스크립트는 SELECT 전용(데이터 변경 없음)

-- ──────────────────────────────────────────────────────────────────────────────
-- 0) 대상 메뉴(치킨) 분류: BBQ 여부 라벨
-- ──────────────────────────────────────────────────────────────────────────────
with chicken_menus as (
  select
    m.id,
    trim(coalesce(m.code, '')) as code,
    m.name,
    trim(coalesce(m.category_main, '')) as category_main,
    trim(coalesce(m.category, '')) as category,
    m.option_selection_groups,
    m.option_selection_config,
    case
      when lower(trim(coalesce(m.code, ''))) in ('c020', 'c021', 'c022', 'c023') then 'BBQ_CODE'
      when lower(coalesce(m.category, '')) like '%bar.b.q%'
        or lower(coalesce(m.category, '')) like '%barbq%'
        or lower(coalesce(m.category, '')) like '%bbq%' then 'BBQ_CATEGORY'
      else 'CHICKEN_GENERAL'
    end as chicken_bucket
  from public.pos_menus m
  where lower(trim(coalesce(m.category_main, ''))) = 'chicken'
     or lower(trim(coalesce(m.code, ''))) like 'c%'
)
select
  chicken_bucket,
  count(*) as menu_count,
  array_agg(code order by code) as menu_codes
from chicken_menus
group by chicken_bucket
order by chicken_bucket;


-- ──────────────────────────────────────────────────────────────────────────────
-- 1) 메뉴별 핵심 비교(가장 먼저 볼 표)
-- ──────────────────────────────────────────────────────────────────────────────
with chicken_menus as (
  select
    m.id,
    trim(coalesce(m.code, '')) as code,
    m.name,
    trim(coalesce(m.category_main, '')) as category_main,
    trim(coalesce(m.category, '')) as category,
    coalesce(m.option_selection_groups, '[]'::jsonb) as option_selection_groups,
    coalesce(m.option_selection_config, '[]'::jsonb) as option_selection_config,
    case
      when lower(trim(coalesce(m.code, ''))) in ('c020', 'c021', 'c022', 'c023') then true
      else false
    end as is_bbq_code
  from public.pos_menus m
  where lower(trim(coalesce(m.category_main, ''))) = 'chicken'
     or lower(trim(coalesce(m.code, ''))) like 'c%'
),
menu_group_flags as (
  select
    cm.*,
    exists (
      select 1
      from jsonb_array_elements_text(cm.option_selection_groups) g
      where lower(trim(g)) = 'size'
    ) as has_size_group,
    exists (
      select 1
      from jsonb_array_elements_text(cm.option_selection_groups) g
      where lower(trim(g)) = 'part'
    ) as has_part_group,
    exists (
      select 1
      from jsonb_array_elements_text(cm.option_selection_groups) g
      where lower(trim(g)) not in ('size', 'part')
    ) as has_ancillary_group
  from chicken_menus cm
),
opt_stats as (
  select
    o.menu_id,
    count(*) filter (where coalesce(o.option_type, 'substitution') = 'substitution') as substitution_count,
    count(*) filter (
      where coalesce(o.option_type, 'substitution') = 'substitution'
        and trim(coalesce(o.name, '')) ~* '^\s*M\s*[-–—]'
    ) as m_named_count,
    count(*) filter (
      where coalesce(o.option_type, 'substitution') = 'substitution'
        and trim(coalesce(o.name, '')) ~* '(wing|drumette|윙|봉)'
    ) as wing_like_count,
    count(*) filter (
      where coalesce(o.option_type, 'substitution') = 'substitution'
        and (
          o.option_step_values ? 'size'
          or o.option_step_values ? 'part'
        )
    ) as size_or_part_step_count
  from public.pos_menu_options o
  group by o.menu_id
)
select
  mgf.code,
  mgf.name,
  mgf.category_main,
  mgf.category,
  case when mgf.is_bbq_code then 'BBQ(C020~C023)' else 'GENERAL' end as rule_bucket,
  mgf.option_selection_groups,
  mgf.option_selection_config,
  mgf.has_size_group,
  mgf.has_part_group,
  mgf.has_ancillary_group,
  coalesce(os.substitution_count, 0) as substitution_count,
  coalesce(os.m_named_count, 0) as m_named_count,
  coalesce(os.wing_like_count, 0) as wing_like_count,
  coalesce(os.size_or_part_step_count, 0) as size_or_part_step_count
from menu_group_flags mgf
left join opt_stats os on os.menu_id = mgf.id
order by mgf.is_bbq_code desc, mgf.code;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2) BBQ 전용 규칙 위반 점검 (0행이 정상)
-- ──────────────────────────────────────────────────────────────────────────────
with bbq_menus as (
  select id, trim(coalesce(code, '')) as code, name, coalesce(option_selection_groups, '[]'::jsonb) as groups
  from public.pos_menus
  where lower(trim(coalesce(code, ''))) in ('c020', 'c021', 'c022', 'c023')
)
select
  'BBQ_FORBIDDEN_GROUP' as issue_type,
  bm.code,
  bm.name,
  g.group_key as issue_value,
  null::text as option_name
from bbq_menus bm
cross join lateral (
  select trim(x) as group_key
  from jsonb_array_elements_text(bm.groups) x
) g
where lower(g.group_key) in ('size', 'part')

union all

select
  'BBQ_FORBIDDEN_OPTION_NAME' as issue_type,
  bm.code,
  bm.name,
  null::text as issue_value,
  trim(coalesce(o.name, '')) as option_name
from bbq_menus bm
join public.pos_menu_options o on o.menu_id = bm.id
where coalesce(o.option_type, 'substitution') = 'substitution'
  and trim(coalesce(o.name, '')) ~* '(wing|drumette|윙|봉)'

union all

select
  'BBQ_FORBIDDEN_STEP_VALUE' as issue_type,
  bm.code,
  bm.name,
  null::text as issue_value,
  trim(coalesce(o.name, '')) || ' | ' || coalesce(o.option_step_values::text, '{}') as option_name
from bbq_menus bm
join public.pos_menu_options o on o.menu_id = bm.id
where coalesce(o.option_type, 'substitution') = 'substitution'
  and (
    lower(trim(coalesce(o.option_step_values->>'part', ''))) not in ('', 'boneless')
    or (o.option_step_values ? 'size')
  )
order by issue_type, code, option_name;


-- ──────────────────────────────────────────────────────────────────────────────
-- 3) 메뉴-옵션그룹 링크 기준 점검 (size/part 링크 잔존 확인)
-- ──────────────────────────────────────────────────────────────────────────────
select
  trim(coalesce(m.code, '')) as code,
  m.name as menu_name,
  g.group_key,
  g.name as group_name,
  l.sort_order,
  l.required,
  l.min_select,
  l.max_select
from public.pos_menu_option_group_links l
join public.pos_menus m on m.id = l.menu_id
join public.pos_option_groups g on g.id = l.group_id
where lower(trim(coalesce(m.code, ''))) in ('c020', 'c021', 'c022', 'c023')
order by code, l.sort_order, g.group_key;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4) 옵션 상세 비교: 일반 치킨 vs BBQ (option_step_values 원문 포함)
-- ──────────────────────────────────────────────────────────────────────────────
with chicken_menus as (
  select
    id,
    trim(coalesce(code, '')) as code,
    name,
    case when lower(trim(coalesce(code, ''))) in ('c020', 'c021', 'c022', 'c023') then 'BBQ' else 'GENERAL' end as bucket
  from public.pos_menus
  where lower(trim(coalesce(category_main, ''))) = 'chicken'
     or lower(trim(coalesce(code, ''))) like 'c%'
)
select
  cm.bucket,
  cm.code,
  cm.name as menu_name,
  o.id as option_id,
  trim(coalesce(o.name, '')) as option_name,
  coalesce(o.option_type, 'substitution') as option_type,
  o.price_modifier,
  o.price_modifier_delivery,
  coalesce(o.option_step_values, '{}'::jsonb) as option_step_values
from chicken_menus cm
join public.pos_menu_options o on o.menu_id = cm.id
where coalesce(o.option_type, 'substitution') = 'substitution'
order by cm.bucket desc, cm.code, o.sort_order, o.id;


-- ──────────────────────────────────────────────────────────────────────────────
-- 5) 요약 리포트: UI 갈림 원인 집계
-- ──────────────────────────────────────────────────────────────────────────────
with chicken_menus as (
  select
    m.id,
    trim(coalesce(m.code, '')) as code,
    case when lower(trim(coalesce(m.code, ''))) in ('c020', 'c021', 'c022', 'c023') then 'BBQ' else 'GENERAL' end as bucket,
    coalesce(m.option_selection_groups, '[]'::jsonb) as groups
  from public.pos_menus m
  where lower(trim(coalesce(m.category_main, ''))) = 'chicken'
     or lower(trim(coalesce(m.code, ''))) like 'c%'
),
group_stats as (
  select
    cm.id,
    cm.bucket,
    exists (
      select 1
      from jsonb_array_elements_text(cm.groups) g
      where lower(trim(g)) = 'size'
    ) as has_size_group,
    exists (
      select 1
      from jsonb_array_elements_text(cm.groups) g
      where lower(trim(g)) = 'part'
    ) as has_part_group,
    exists (
      select 1
      from jsonb_array_elements_text(cm.groups) g
      where lower(trim(g)) not in ('size', 'part')
    ) as has_ancillary_group
  from chicken_menus cm
),
option_stats as (
  select
    o.menu_id,
    count(*) filter (
      where coalesce(o.option_type, 'substitution') = 'substitution'
        and trim(coalesce(o.name, '')) ~* '^\s*M\s*[-–—]'
    ) as m_named_count,
    count(*) filter (
      where coalesce(o.option_type, 'substitution') = 'substitution'
        and trim(coalesce(o.name, '')) ~* '(wing|drumette|윙|봉)'
    ) as wing_like_count
  from public.pos_menu_options o
  group by o.menu_id
)
select
  gs.bucket,
  count(*) as menu_count,
  count(*) filter (where gs.has_size_group) as menus_with_size_group,
  count(*) filter (where gs.has_part_group) as menus_with_part_group,
  count(*) filter (where gs.has_ancillary_group) as menus_with_ancillary_group,
  count(*) filter (where coalesce(os.m_named_count, 0) > 0) as menus_with_m_named_option,
  count(*) filter (where coalesce(os.wing_like_count, 0) > 0) as menus_with_wing_like_option
from group_stats gs
left join option_stats os on os.menu_id = gs.id
group by gs.bucket
order by gs.bucket;
