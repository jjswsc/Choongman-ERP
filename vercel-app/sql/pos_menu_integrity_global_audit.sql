-- POS 메뉴 전수 정합성 점검 (전매장 공통 이슈 탐지)
-- 목적:
-- 1) 메뉴-옵션-프로모 참조 꼬임 탐지
-- 2) 옵션 코드/선택 단계 불일치 탐지
-- 3) POS 노출 시 문제될 수 있는 데이터 조합 탐지

-- =========================================================
-- A. 메뉴/옵션 참조 고아 점검 (0건 권장)
-- =========================================================
select 'pos_menu_options_orphan_menu' as check_name, count(*) as row_count
from pos_menu_options o
left join pos_menus m on m.id = o.menu_id
where m.id is null
union all
select 'pos_menu_ingredients_orphan_menu', count(*)
from pos_menu_ingredients i
left join pos_menus m on m.id = i.menu_id
where m.id is null
union all
select 'pos_promo_items_orphan_menu', count(*)
from pos_promo_items p
left join pos_menus m on m.id = p.menu_id
where m.id is null
union all
select 'pos_promo_items_orphan_option', count(*)
from pos_promo_items p
left join pos_menu_options o on o.id = p.option_id
where p.option_id is not null
  and o.id is null
order by check_name;

-- =========================================================
-- B. 프로모 구성 option_id가 다른 메뉴를 가리키는 불일치 (0건 권장)
-- =========================================================
select
  p.id as promo_item_id,
  p.promo_id,
  pr.code as promo_code,
  pr.name as promo_name,
  p.menu_id,
  m.code as menu_code,
  p.option_id,
  o.menu_id as option_menu_id,
  o.option_code,
  o.name as option_name
from pos_promo_items p
join pos_promos pr on pr.id = p.promo_id
left join pos_menus m on m.id = p.menu_id
left join pos_menu_options o on o.id = p.option_id
where p.option_id is not null
  and o.id is not null
  and o.menu_id <> p.menu_id
order by p.promo_id, p.id;

-- =========================================================
-- C. 옵션 코드 정합성 (중복/메뉴코드 prefix 불일치)
-- =========================================================
-- C-1) 같은 메뉴 내 option_code 중복 (0건 권장)
select
  o.menu_id,
  lower(trim(coalesce(o.option_code, ''))) as option_code_key,
  count(*) as row_count,
  array_agg(o.id order by o.id) as option_ids
from pos_menu_options o
where trim(coalesce(o.option_code, '')) <> ''
group by o.menu_id, lower(trim(coalesce(o.option_code, '')))
having count(*) > 1
order by o.menu_id, option_code_key;

-- C-2) option_code prefix != menu code (0건 권장)
select
  o.id as option_id,
  o.menu_id,
  m.code as menu_code,
  o.option_code
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where trim(coalesce(o.option_code, '')) <> ''
  and split_part(trim(o.option_code), '-', 1) <> trim(coalesce(m.code, ''))
order by o.menu_id, o.id;

-- =========================================================
-- D. 옵션 모달 빈화면 위험 데이터 점검
--   (메뉴가 option_selection_groups를 가졌는데, substitution 옵션의 step key가 전혀 매칭 안 되는 경우)
-- =========================================================
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

-- =========================================================
-- E. 활성 메뉴인데 옵션 단계 그룹만 있고 옵션 행이 0건 (주의)
-- =========================================================
select
  m.id,
  m.code,
  m.name,
  m.is_active,
  coalesce(
    (
      select count(*)
      from pos_menu_options o
      where o.menu_id = m.id
        and coalesce(o.option_type, 'substitution') = 'substitution'
    ),
    0
  ) as substitution_option_count
from pos_menus m
where coalesce(m.is_active, true) = true
  and coalesce(jsonb_array_length(
        case
          when m.option_selection_groups is null then '[]'::jsonb
          when jsonb_typeof(m.option_selection_groups::jsonb) = 'array' then m.option_selection_groups::jsonb
          else '[]'::jsonb
        end
      ), 0) > 0
  and not exists (
    select 1
    from pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  )
order by m.code, m.id;

-- =========================================================
-- F. 매장 scope 누락(호환모드 OFF 환경에서 미노출 위험)
-- =========================================================
select
  m.id,
  m.code,
  m.name,
  m.is_active
from pos_menus m
left join pos_menu_store_scopes s
  on s.menu_id = m.id and s.enabled is distinct from false
where coalesce(m.is_active, true) = true
group by m.id, m.code, m.name, m.is_active
having count(s.menu_id) = 0
order by m.code, m.id;
