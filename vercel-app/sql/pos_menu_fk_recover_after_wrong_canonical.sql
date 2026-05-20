-- 잘못된 canonical 병합 후 FK 복구 (Tteokbokki <-> Dosirak 뒤바뀜)
-- 확정 매핑:
--   wrong 1(T001) -> correct 69(K001)
--   wrong 2(T002) -> correct 67(K002)
--   wrong 3(T003) -> correct 68(K003)
--
-- 목적:
-- 1) pos_menu_options / pos_menu_ingredients / pos_promo_items 의 menu_id를 원복
-- 2) 옵션 코드 prefix를 메뉴 코드와 일치시키도록 재정렬
-- 3) Festival Set 5 의 Snow Onion 옵션을 boneless 기본(null)로 복구

-- [사전 확인] 현재 분포
select
  m.id, m.code, m.name,
  (select count(*) from pos_menu_options o where o.menu_id = m.id) as opt_cnt,
  (select count(*) from pos_menu_ingredients i where i.menu_id = m.id) as ing_cnt,
  (select count(*) from pos_promo_items p where p.menu_id = m.id) as promo_item_cnt
from pos_menus m
where m.id in (1,2,3,67,68,69)
order by m.id;

begin;

with mapping as (
  select 1::bigint as wrong_id, 69::bigint as correct_id
  union all select 2::bigint, 67::bigint
  union all select 3::bigint, 68::bigint
)
update pos_menu_options o
set menu_id = m.correct_id
from mapping m
where o.menu_id = m.wrong_id;

with mapping as (
  select 1::bigint as wrong_id, 69::bigint as correct_id
  union all select 2::bigint, 67::bigint
  union all select 3::bigint, 68::bigint
)
update pos_menu_ingredients i
set menu_id = m.correct_id
from mapping m
where i.menu_id = m.wrong_id;

with mapping as (
  select 1::bigint as wrong_id, 69::bigint as correct_id
  union all select 2::bigint, 67::bigint
  union all select 3::bigint, 68::bigint
)
update pos_promo_items p
set menu_id = m.correct_id
from mapping m
where p.menu_id = m.wrong_id;

-- Festival Set 5: Snow Onion은 옵션 강제가 아니라 기본(boneless)으로
update pos_promo_items pi
set option_id = null
where pi.id in (
  select pi2.id
  from pos_promo_items pi2
  join pos_promos pp on pp.id = pi2.promo_id
  where pp.code = '260465-S05'
    and pi2.menu_id = 11
);

commit;

-- [사후 확인 1] FK 분포
select
  m.id, m.code, m.name,
  (select count(*) from pos_menu_options o where o.menu_id = m.id) as opt_cnt,
  (select count(*) from pos_menu_ingredients i where i.menu_id = m.id) as ing_cnt,
  (select count(*) from pos_promo_items p where p.menu_id = m.id) as promo_item_cnt
from pos_menus m
where m.id in (1,2,3,67,68,69)
order by m.id;

-- [사후 확인 2] Festival Set 5
select
  pp.id as promo_id, pp.code as promo_code, pp.name as promo_name,
  pi.id as promo_item_id, pi.menu_id, pm.code as menu_code, pm.name as menu_name,
  pi.option_id, o.menu_id as option_menu_id, o.option_code, o.name as option_name
from pos_promos pp
join pos_promo_items pi on pi.promo_id = pp.id
left join pos_menus pm on pm.id = pi.menu_id
left join pos_menu_options o on o.id = pi.option_id
where pp.code = '260465-S05'
order by pi.sort_order nulls last, pi.id;

-- [후속 필수] 옵션 코드 prefix 보정
-- vercel-app/sql/pos_menu_option_code_prefix_autofix.sql 실행
