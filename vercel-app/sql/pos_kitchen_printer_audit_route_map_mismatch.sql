-- 선행 조건: public.pos_printer_settings 에 kitchen_route_* 컬럼이 있어야 함.
-- 없으면 먼저 실행: vercel-app/sql/pos_printer_kitchen_routes.sql

-- 매장별 프린터 JSON(kitchen_route_by_menu)과 pos_menus.kitchen_printer 불일치
with settings_map as (
  select
    store_code,
    coalesce(kitchen_route_by_menu, '{}'::jsonb) as route_map
  from pos_printer_settings
),
menu_route as (
  select
    s.store_code,
    kv.key as menu_id_text,
    case
      when kv.value ~ '^[0-3]$' then kv.value::int
      else null
    end as settings_route
  from settings_map s
  cross join lateral jsonb_each_text(s.route_map) as kv
)
select
  mr.store_code,
  mr.menu_id_text,
  pm.id as menu_id,
  pm.code,
  pm.name,
  mr.settings_route,
  pm.kitchen_printer as menu_kitchen_printer
from menu_route mr
join pos_menus pm
  on pm.id::text = mr.menu_id_text
where mr.settings_route is not null
  and mr.settings_route <> coalesce(pm.kitchen_printer, 1)
order by mr.store_code, pm.code, pm.name, pm.id;
