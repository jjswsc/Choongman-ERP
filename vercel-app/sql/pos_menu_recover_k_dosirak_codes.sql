-- K001/K002/K003 잘못된 canonical 매핑 복구
-- 현재 상태(예시):
--   wrong(canonical): id 1(K001,Tteokbokki), 2(K002,Rosé Tteokbokki), 3(K003,Cheese Tteokbokki)
--   correct(dup):     id 69(k001__dup_69,Dakgalbi Dosirak), 67(k002__dup_67,Gochujang Bulgogi Dosirak), 68(k003__dup_68,Soy Sauce Bulgogi Dosirak)
--
-- 복구 내용:
-- 1) wrong id의 매장 scope를 correct id로 복사
-- 2) wrong id 코드를 임시 코드로 이동(유니크 충돌 방지)
-- 3) correct id를 K001/K002/K003으로 복구 + 활성화
--
-- 주의:
-- - 이 스크립트는 현재 확인된 id 기준(1,2,3 / 69,67,68)으로 작성됨
-- - 실행 전 반드시 아래 사전 점검 결과를 확인

-- [사전 점검]
select id, code, name, is_active, category_main, category
from pos_menus
where id in (1,2,3,67,68,69)
order by id;

begin;

with mapping as (
  -- wrong_id: 잘못 K코드를 점유한 행 / correct_id: 실제 도시락 행
  select 1::bigint as wrong_id, 69::bigint as correct_id, 'K001'::text as canonical_code
  union all
  select 2::bigint, 67::bigint, 'K002'::text
  union all
  select 3::bigint, 68::bigint, 'K003'::text
)
-- 1) 매장 scope 복사
insert into pos_menu_store_scopes (menu_id, store_code, enabled)
select
  m.correct_id as menu_id,
  s.store_code,
  true as enabled
from mapping m
join pos_menu_store_scopes s
  on s.menu_id = m.wrong_id
where s.store_code is not null
  and trim(coalesce(s.store_code, '')) <> ''
  and s.enabled is distinct from false
on conflict (store_code, menu_id)
do update set enabled = true;

with mapping as (
  select 1::bigint as wrong_id, 69::bigint as correct_id, 'K001'::text as canonical_code
  union all
  select 2::bigint, 67::bigint, 'K002'::text
  union all
  select 3::bigint, 68::bigint, 'K003'::text
)
-- 2) wrong 코드 임시 이동
update pos_menus pm
set code = concat('RECOVER_TMP_', pm.id)
from mapping m
where pm.id = m.wrong_id;

with mapping as (
  select 1::bigint as wrong_id, 69::bigint as correct_id, 'K001'::text as canonical_code
  union all
  select 2::bigint, 67::bigint, 'K002'::text
  union all
  select 3::bigint, 68::bigint, 'K003'::text
)
-- 3) correct 코드 복구 + 활성화
update pos_menus pm
set code = m.canonical_code,
    is_active = true
from mapping m
where pm.id = m.correct_id;

commit;

-- [사후 검증]
select id, code, name, is_active, category_main, category
from pos_menus
where id in (1,2,3,67,68,69)
order by id;

select pm.id, pm.code, pm.name, pm.is_active,
       array_agg(distinct pms.store_code order by pms.store_code) as stores
from pos_menus pm
left join pos_menu_store_scopes pms
  on pms.menu_id = pm.id and pms.enabled is distinct from false
where pm.id in (1,2,3,67,68,69)
group by pm.id, pm.code, pm.name, pm.is_active
order by pm.id;

-- 옵션 코드 prefix도 맞춰주기 (권장)
-- vercel-app/sql/pos_menu_option_code_prefix_autofix.sql 실행
