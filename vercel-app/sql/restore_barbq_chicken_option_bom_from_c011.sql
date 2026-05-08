-- Bar.B.Q Fried Chicken 옵션별 BOM 재생성
--
-- 상황:
-- - C020~C023 의 M - Boneless / M - Wing / M - Drumette 옵션에 pos_menu_ingredients 가 0행이면
--   원가 분석에서 옵션별 원가가 비어 있거나 기본 원가로만 보입니다.
-- - 옛 옵션별 BOM 이 FK CASCADE 등으로 삭제된 경우, DB 안에서 "예전 그대로" 복원은 불가능합니다.
--
-- 복구 전략:
-- - C011 GOLDEN FRIED CHICKEN 의 동일 옵션 BOM 을 기준 레시피로 복사합니다.
-- - 각 BBQ 메뉴(C020~C023)의 기본 BOM 중 C011 기본 BOM 대비 추가된 행(소스/양념 차이)을
--   옵션 BOM 에도 더합니다.
-- - 이미 해당 옵션에 BOM 이 있는 경우는 건드리지 않습니다.
--
-- 실행 전 확인:
--   select code, name from pos_menus where code in ('C011','C020','C021','C022','C023');
--   select * from pos_menu_ingredients where menu_id in (select id from pos_menus where code in ('C011','C020','C021','C022','C023'));

begin;

with
ref_menu as (
  select id
  from pos_menus
  where code = 'C011'
  limit 1
),
target_menus as (
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
ref_options as (
  select
    o.id as ref_option_id,
    trim(o.name) as option_name
  from pos_menu_options o
  join ref_menu r on r.id = o.menu_id
  where coalesce(o.option_type, 'substitution') = 'substitution'
    and trim(o.name) in ('M - Boneless', 'M - Wing', 'M - Drumette')
),
empty_target_options as (
  select t.*
  from target_options t
  where not exists (
    select 1
    from pos_menu_ingredients i
    where i.menu_id = t.menu_id
      and i.option_id = t.option_id
  )
),
ref_option_bom as (
  select
    ro.option_name,
    i.item_code,
    i.quantity,
    i.loss_rate,
    coalesce(i.ingredient_type, 'food') as ingredient_type
  from ref_options ro
  join pos_menu_ingredients i on i.option_id = ro.ref_option_id
),
ref_base as (
  select
    i.item_code,
    coalesce(i.ingredient_type, 'food') as ingredient_type,
    coalesce(i.loss_rate, 0) as loss_rate,
    sum(coalesce(i.quantity, 0)) as quantity
  from ref_menu r
  join pos_menu_ingredients i on i.menu_id = r.id
  where i.option_id is null or i.option_id = 0
  group by i.item_code, coalesce(i.ingredient_type, 'food'), coalesce(i.loss_rate, 0)
),
target_base as (
  select
    m.id as menu_id,
    m.code,
    i.item_code,
    coalesce(i.ingredient_type, 'food') as ingredient_type,
    coalesce(i.loss_rate, 0) as loss_rate,
    sum(coalesce(i.quantity, 0)) as quantity
  from target_menus m
  join pos_menu_ingredients i on i.menu_id = m.id
  where i.option_id is null or i.option_id = 0
  group by m.id, m.code, i.item_code, coalesce(i.ingredient_type, 'food'), coalesce(i.loss_rate, 0)
),
target_base_extra as (
  select
    tb.menu_id,
    tb.code,
    tb.item_code,
    tb.ingredient_type,
    tb.loss_rate,
    greatest(tb.quantity - coalesce(rb.quantity, 0), 0) as quantity
  from target_base tb
  left join ref_base rb
    on rb.item_code = tb.item_code
   and rb.ingredient_type = tb.ingredient_type
   and rb.loss_rate = tb.loss_rate
  where greatest(tb.quantity - coalesce(rb.quantity, 0), 0) > 0
),
insert_ref_option_bom as (
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
    r.item_code,
    r.quantity,
    r.loss_rate,
    r.ingredient_type
  from empty_target_options t
  join ref_option_bom r on r.option_name = t.option_name
  returning id
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
  e.item_code,
  e.quantity,
  e.loss_rate,
  e.ingredient_type
from empty_target_options t
join target_base_extra e on e.menu_id = t.menu_id;

commit;

-- 적용 후 확인
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
