-- Bar.B.Q Fried Chicken 옵션별 BOM 보충
--
-- 목적:
-- - restore_barbq_chicken_option_bom_from_c011.sql 실행 후 옵션 BOM이 일부만 들어가 있는 상태(닭고기 등 누락)를
--   메뉴 기본 BOM 기준으로 "누락된 품목"만 추가해 정상 원가에 맞춘다.
-- - 이미 옵션 BOM 에 있는 품목(같은 item_code + ingredient_type)은 건드리지 않는다.
-- - M 사이즈에 맞게 닭고기 양을 더 늘리고 싶다면 admin/pos-cost-analysis → 원가 계산기에서 직접 조정.
--
-- 대상: C020 / C021 / C022 / C023 의 M - Boneless / M - Wing / M - Drumette 옵션
-- 사전 진단:
--   select code, o.id as option_id, o.name, count(i.id) as bom_rows
--   from pos_menus m
--   join pos_menu_options o on o.menu_id = m.id
--   left join pos_menu_ingredients i on i.menu_id = m.id and i.option_id = o.id
--   where m.code in ('C020','C021','C022','C023')
--     and trim(o.name) in ('M - Boneless','M - Wing','M - Drumette')
--   group by code, o.id, o.name
--   order by code, o.id;
--
-- 보충 후에는 옵션 원가 >= 메뉴 기본 원가가 됩니다.

begin;

with target_menus as (
  select id, code
  from pos_menus
  where code in ('C020', 'C021', 'C022', 'C023')
),
target_options as (
  select
    m.id as menu_id,
    m.code,
    o.id as option_id,
    trim(o.name) as option_name
  from target_menus m
  join pos_menu_options o on o.menu_id = m.id
  where coalesce(o.option_type, 'substitution') = 'substitution'
    and trim(o.name) in ('M - Boneless', 'M - Wing', 'M - Drumette')
),
base_bom as (
  select
    m.id as menu_id,
    i.item_code,
    coalesce(i.ingredient_type, 'food') as ingredient_type,
    i.quantity,
    i.loss_rate
  from target_menus m
  join pos_menu_ingredients i on i.menu_id = m.id
  where i.option_id is null or i.option_id = 0
)
insert into pos_menu_ingredients (
  menu_id,
  option_id,
  item_code,
  quantity,
  loss_rate,
  ingredient_type
)
select
  t.menu_id,
  t.option_id,
  b.item_code,
  b.quantity,
  b.loss_rate,
  b.ingredient_type
from target_options t
join base_bom b on b.menu_id = t.menu_id
where not exists (
  -- 이미 같은 옵션 BOM 에 동일 item_code + ingredient_type 이 있으면 추가하지 않음 (중복 방지)
  select 1
  from pos_menu_ingredients i
  where i.menu_id = t.menu_id
    and i.option_id = t.option_id
    and i.item_code = b.item_code
    and coalesce(i.ingredient_type, 'food') = b.ingredient_type
);

commit;

-- 적용 후 확인 (옵션별 BOM 행 수와 합계 수량)
with target_menus as (
  select id, code
  from pos_menus
  where code in ('C020', 'C021', 'C022', 'C023')
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
where trim(o.name) in ('M - Boneless', 'M - Wing', 'M - Drumette')
group by m.code, o.id, o.name
order by m.code, o.id;
