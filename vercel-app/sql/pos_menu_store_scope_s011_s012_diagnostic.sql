-- S011 Cajun Chicken Salad / S012 Caesar Salad — 매장별 POS 노출 진단
-- 증상: Silom, Seacon, True Digital 등 특정 매장 POS에 메뉴 없음
-- 로직: vercel-app/lib/pos-menu-store-scope.ts, app/api/getPosMenus/route.ts

-- 1) 메뉴 기본 정보
select id, code, name, is_active, category_main, category, sell_hall, sell_delivery
from public.pos_menus
where upper(trim(code)) in ('S011', 'S012')
order by code;

-- 2) DB에 저장된 노출 매장 (관리 화면 체크박스와 1:1)
select pm.code, pm.name, pms.store_code, pms.enabled, pms.updated_at
from public.pos_menus pm
join public.pos_menu_store_scopes pms on pms.menu_id = pm.id
where upper(trim(pm.code)) in ('S011', 'S012')
order by pm.code, pms.store_code;

-- 3) 누락 매장 확인 (아래 IN 목록을 erp_stores 기준으로 조정)
with targets as (
  select unnest(array[
    'CM Silom',
    'CM Seacon Srinakarin',
    'CM True Digital'
  ]) as store_code
),
menus as (
  select id, code, name
  from public.pos_menus
  where upper(trim(code)) in ('S011', 'S012')
)
select
  m.code,
  m.name,
  t.store_code as missing_for_store,
  exists (
    select 1
    from public.pos_menu_store_scopes pms
    where pms.menu_id = m.id
      and pms.enabled is distinct from false
      and lower(replace(replace(trim(pms.store_code), '-', ''), ' ', ''))
        = lower(replace(replace(trim(t.store_code), '-', ''), ' ', ''))
  ) as has_scope_row
from menus m
cross join targets t
order by m.code, t.store_code;

-- 4) 스코프 행 수 vs 운영 매장 수 (erp_stores 비어 있으면 pos_menu_store_scopes 등에서 매장 목록 추정)
with store_sources as (
  select distinct trim(store_code) as store_code
  from public.pos_menu_store_scopes
  where trim(coalesce(store_code, '')) <> ''
  union
  select distinct trim(store_code)
  from public.erp_stores
  where trim(coalesce(store_code, '')) <> ''
    and coalesce(is_active, true) = true
  union
  select distinct trim(store_code)
  from public.pos_printer_settings
  where trim(coalesce(store_code, '')) <> ''
  union
  select distinct trim(store) as store_code
  from public.employees
  where trim(coalesce(store, '')) <> ''
),
store_count as (
  select count(*) as n from store_sources where store_code <> ''
),
menu_scope as (
  select
    pm.id,
    pm.code,
    count(pms.store_code) filter (where pms.enabled is distinct from false) as scoped_stores
  from public.pos_menus pm
  left join public.pos_menu_store_scopes pms on pms.menu_id = pm.id
  where upper(trim(pm.code)) in ('S011', 'S012')
  group by pm.id, pm.code
)
select
  ms.code,
  ms.scoped_stores,
  sc.n as total_known_stores,
  case
    when ms.scoped_stores = 0 then 'no_scope_compat_mode_shows_all'
    when sc.n = 0 then 'partial_scope_unknown_total'
    when ms.scoped_stores < sc.n then 'partial_scope_some_stores_hidden'
    when ms.scoped_stores >= sc.n then 'scoped_all_known_stores'
    else 'check_manually'
  end as scope_status
from menu_scope ms
cross join store_count sc;

-- 5) (선택) 최근 노출 매장 변경 감사 — pos_menu_audit_logs 배포된 DB만
-- select changed_at, actor_name, actor_store, action_type,
--        before_row->'storeCodes' as before_stores,
--        after_row->'storeCodes' as after_stores,
--        detail
-- from public.pos_menu_audit_logs
-- where menu_code in ('S011', 'S012')
--   and (before_row->'storeCodes' is distinct from after_row->'storeCodes')
-- order by changed_at desc
-- limit 30;

-- 6) (수정) Silom·Seacon·True에 S011/S012 노출 추가 — §2·§3 확인 후 실행
-- insert into public.pos_menu_store_scopes (menu_id, store_code, enabled)
-- select pm.id, s.store_code, true
-- from public.pos_menus pm
-- cross join (
--   values
--     ('CM Silom'),
--     ('CM Seacon Srinakarin'),
--     ('CM True Digital')
-- ) as s(store_code)
-- where upper(trim(pm.code)) in ('S011', 'S012')
-- on conflict (store_code, menu_id) do update
-- set enabled = true, updated_at = now();
