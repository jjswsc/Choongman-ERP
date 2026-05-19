-- Chicken Dosirak (K031/K032 등) 주방 프린터 불일치 점검·복구
-- 원인: pos_menus 에 동일 code 가 여러 id 로 있고, 주문 menuId ≠ 프린터 설정 id 인 경우
-- 선행: pos_printer_kitchen_routes.sql, pos_kitchen_printer_audit_route_map_mismatch.sql

-- 1) 동일 code · 서로 다른 kitchen_printer
select lower(trim(code)) as code_key,
       count(*) as row_count,
       array_agg(id order by id) as menu_ids,
       array_agg(distinct coalesce(kitchen_printer, -1) order by coalesce(kitchen_printer, -1)) as kitchen_printers,
       array_agg(name order by id) as names
from pos_menus
where trim(coalesce(code, '')) <> ''
  and lower(trim(code)) in ('k031', 'k032', 'k022', 'k001', 'k002', 'k003')
group by lower(trim(code))
having count(*) > 1
   and count(distinct coalesce(kitchen_printer, -1)) > 1
order by code_key;

-- 2) Ekkamai 등 매장 설정 JSON vs pos_menus (불일치만)
-- store_code 는 실제 값으로 바꿔 실행
/*
with settings_map as (
  select coalesce(kitchen_route_by_menu, '{}'::jsonb) as route_map
  from pos_printer_settings
  where store_code = 'CM Ekkamai'
  limit 1
)
select pm.id, pm.code, pm.name, pm.kitchen_printer,
       (settings_map.route_map ->> pm.id::text)::int as settings_route
from pos_menus pm
cross join settings_map
where lower(trim(pm.code)) in ('k031', 'k032')
  and settings_map.route_map ? pm.id::text
  and (settings_map.route_map ->> pm.id::text)::int <> coalesce(pm.kitchen_printer, 1);
*/

-- 3) 복구: 동일 code 전 행 kitchen_printer 를 설정 JSON(있으면) 또는 1 로 통일
--    K031/K032 를 ครัว 1 로 맞출 때 — Supabase 에서 1) 결과 확인 후 실행
begin;

with target_codes as (
  select unnest(array['k031', 'k032']::text[]) as code_key
),
settings_map as (
  select coalesce(kitchen_route_by_menu, '{}'::jsonb) as route_map
  from pos_printer_settings
  where store_code ilike '%ekkamai%'
  order by updated_at desc nulls last
  limit 1
),
code_route as (
  select lower(trim(pm.code)) as code_key,
         max((sm.route_map ->> pm.id::text)::int) as route
  from pos_menus pm
  cross join settings_map sm
  where lower(trim(pm.code)) in (select code_key from target_codes)
    and sm.route_map ? pm.id::text
    and (sm.route_map ->> pm.id::text) ~ '^[0-3]$'
  group by lower(trim(pm.code))
)
update pos_menus pm
set kitchen_printer = coalesce(cr.route, 1)
from code_route cr
where lower(trim(pm.code)) = cr.code_key
  and coalesce(pm.kitchen_printer, -1) is distinct from coalesce(cr.route, 1);

-- 설정 JSON 에 없고 code 만 있는 중복 행: 활성 행 기준으로 맞춤(수동 route 지정 시 아래 값 수정)
update pos_menus pm
set kitchen_printer = 1
where lower(trim(coalesce(pm.code, ''))) in ('k031', 'k032')
  and coalesce(pm.kitchen_printer, 1) <> 1;

commit;

-- 4) 검증
select id, code, name, kitchen_printer, is_active
from pos_menus
where lower(trim(code)) in ('k031', 'k032', 'k022')
order by lower(code), id;
