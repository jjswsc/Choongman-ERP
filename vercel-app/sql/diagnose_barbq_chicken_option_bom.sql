-- BBQ Fried Chicken 옵션별 BOM(원가) 상태 진단 + 고아 BOM 자동 재연결
--
-- 실행 순서:
--   1) 진단 쿼리(SELECT)만 먼저 돌려 결과를 살펴본다.
--   2) "고아 BOM"(어떤 옵션과도 연결되지 않은 ingredient 행)이 있으면
--      step 4 의 UPDATE 로 현재 옵션에 sort_order 순으로 재연결한다.
--   3) step 5 진단 SELECT로 재연결 결과를 확인한다.
--
-- 주의:
-- - pos_menu_ingredients.option_id 에 FK CASCADE 가 있으면, 과거 옵션을 delete 했을 때
--   해당 옵션에 매달려 있던 BOM 행도 함께 삭제됐을 수 있다(=복원 불가).
-- - 본 스크립트는 BBQ 카테고리만 대상으로 한다. (필요 시 where 절을 조정)

-- 1) 대상 메뉴 목록 (BBQ 계열 + 코드/이름)
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

-- 2) 메뉴별 옵션 + 옵션의 BOM 행 수
--    (option_bom_cnt = 0 이면 그 옵션은 BOM이 없어 cost 0 또는 base 폴백으로 보임)
with target_menus as (
  select id, code, name
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
)
select
  m.code,
  m.name as menu_name,
  o.id as option_id,
  o.sort_order,
  o.name as option_name,
  o.option_type,
  count(i.id) filter (where i.menu_id = m.id) as option_bom_cnt
from target_menus m
left join pos_menu_options o on o.menu_id = m.id
left join pos_menu_ingredients i
       on i.menu_id = m.id and i.option_id = o.id
group by m.code, m.name, o.id, o.sort_order, o.name, o.option_type
order by m.code, o.sort_order nulls last, o.id;

-- 3) "고아" BOM 진단: 메뉴에는 속하지만 현재 어떤 옵션 id 와도 매칭되지 않는 ingredient 행
--    option_id 가 NULL/0 인 행은 메뉴 기본 BOM 이므로 고아가 아님(제외).
with target_menus as (
  select id, code
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
),
current_opts as (
  select o.id as option_id, o.menu_id
  from pos_menu_options o
  where o.menu_id in (select id from target_menus)
)
select
  m.code,
  i.menu_id,
  i.option_id as orphan_option_id,
  i.id as ingredient_id,
  i.item_code,
  i.quantity,
  i.loss_rate,
  i.ingredient_type
from pos_menu_ingredients i
join target_menus m on m.id = i.menu_id
where i.option_id is not null
  and i.option_id <> 0
  and not exists (
    select 1 from current_opts c
    where c.menu_id = i.menu_id and c.option_id = i.option_id
  )
order by m.code, i.menu_id, i.option_id, i.id;

-- 4) 고아 BOM 재연결 (필요할 때만 BEGIN/COMMIT 해제 후 실행)
--    ▸ 같은 메뉴 안에서 sort_order 가 빠른 "BOM 없는 옵션" 부터,
--    ▸ orphan_option_id 작은 값 순서로 한 번에 묶어 재연결한다.
--    (옵션이 여러 개고 고아 그룹이 여러 개일 때, 그룹 전체가 한 옵션에 매달리도록
--     groupwise update 대신 1:1 매핑이 안전. 아래는 '메뉴별 첫 빈 옵션 → 첫 고아 그룹'
--     의 안전한 1단계 매핑만 수행한다. 두 번째 빈 옵션이 있다면 SQL 을 다시 실행.)

-- begin;
--
-- with target_menus as (
--   select id from pos_menus
--   where coalesce(category_main, '') = 'Chicken'
--     and (
--       coalesce(category, '') ilike '%bar%b%q%'
--       or coalesce(category, '') ilike '%bar.b.q%'
--       or coalesce(category, '') ilike '%bbq%'
--     )
-- ),
-- options_no_bom as (
--   select o.id as option_id, o.menu_id, o.sort_order
--   from pos_menu_options o
--   where o.menu_id in (select id from target_menus)
--     and coalesce(o.option_type, 'substitution') = 'substitution'
--     and not exists (
--       select 1 from pos_menu_ingredients i
--       where i.menu_id = o.menu_id and i.option_id = o.id
--     )
-- ),
-- orphan_groups as (
--   select i.menu_id, i.option_id as orphan_option_id, min(i.id) as min_id
--   from pos_menu_ingredients i
--   join target_menus tm on tm.id = i.menu_id
--   where i.option_id is not null
--     and i.option_id <> 0
--     and not exists (
--       select 1 from pos_menu_options o
--       where o.menu_id = i.menu_id and o.id = i.option_id
--     )
--   group by i.menu_id, i.option_id
-- ),
-- ranked as (
--   select
--     menu_id, option_id, sort_order,
--     row_number() over (partition by menu_id order by sort_order asc, option_id asc) as rn
--   from options_no_bom
-- ),
-- ranked_orphans as (
--   select
--     menu_id, orphan_option_id, min_id,
--     row_number() over (partition by menu_id order by min_id asc, orphan_option_id asc) as rn
--   from orphan_groups
-- ),
-- mapping as (
--   select r.menu_id, r.option_id as new_option_id, ro.orphan_option_id
--   from ranked r
--   join ranked_orphans ro on ro.menu_id = r.menu_id and ro.rn = r.rn
-- )
-- update pos_menu_ingredients i
-- set option_id = m.new_option_id
-- from mapping m
-- where i.menu_id = m.menu_id
--   and i.option_id = m.orphan_option_id;
--
-- commit;

-- 5) 재연결 후 옵션별 BOM 합계 (cost 추정용 sanity check)
with target_menus as (
  select id, code
  from pos_menus
  where coalesce(category_main, '') = 'Chicken'
    and (
      coalesce(category, '') ilike '%bar%b%q%'
      or coalesce(category, '') ilike '%bar.b.q%'
      or coalesce(category, '') ilike '%bbq%'
    )
)
select
  m.code,
  o.id as option_id,
  o.name as option_name,
  count(i.id) as bom_rows,
  sum(coalesce(i.quantity, 0)) as total_qty
from target_menus m
join pos_menu_options o on o.menu_id = m.id
left join pos_menu_ingredients i
       on i.menu_id = m.id and i.option_id = o.id
group by m.code, o.id, o.name
order by m.code, o.id;
