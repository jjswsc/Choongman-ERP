-- 떡볶이 메뉴 코드 재배정 (RECOVER_TMP_* -> T001/T002/T003)
-- 대상:
--   id=1  Tteokbokki        -> T001
--   id=2  Rosé Tteokbokki   -> T002
--   id=3  Cheese Tteokbokki -> T003
--
-- 전제:
-- - pos_menu_recover_k_dosirak_codes.sql 실행 후, 위 id가 RECOVER_TMP_* 상태
-- - T001/T002/T003가 비어 있거나, 같은 id에 이미 할당된 상태

-- [사전 점검] 현재 코드 상태
select id, code, name, is_active, category_main, category
from pos_menus
where id in (1,2,3)
   or upper(trim(code)) in ('T001','T002','T003')
order by id;

begin;

with mapping as (
  select 1::bigint as menu_id, 'T001'::text as target_code
  union all
  select 2::bigint, 'T002'::text
  union all
  select 3::bigint, 'T003'::text
),
conflict as (
  select m.menu_id, m.target_code, pm.id as conflict_id
  from mapping m
  join pos_menus pm
    on lower(trim(pm.code)) = lower(trim(m.target_code))
   and pm.id <> m.menu_id
)
-- 충돌 코드가 있으면 임시 코드로 비켜놓기
update pos_menus pm
set code = concat('RECOVER_T_CONFLICT_', pm.id)
from conflict c
where pm.id = c.conflict_id;

with mapping as (
  select 1::bigint as menu_id, 'T001'::text as target_code
  union all
  select 2::bigint, 'T002'::text
  union all
  select 3::bigint, 'T003'::text
)
update pos_menus pm
set code = m.target_code,
    is_active = true
from mapping m
where pm.id = m.menu_id;

commit;

-- [사후 검증]
select id, code, name, is_active, category_main, category
from pos_menus
where id in (1,2,3)
   or upper(trim(code)) in ('T001','T002','T003')
order by id;

-- 옵션 코드 prefix 재정렬 (권장)
-- vercel-app/sql/pos_menu_option_code_prefix_autofix.sql 실행
