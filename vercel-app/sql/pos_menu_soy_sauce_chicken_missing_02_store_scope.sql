-- Soy Sauce Chicken이 특정 매장 POS에만 안 보일 때
-- pos_menu_store_scopes에 행이 있으면 그 매장만 노출 (호환 모드에서 스코프 0건은 전 매장)
-- 로직: lib/pos-menu-store-scope.ts shouldMenuBeVisibleForStore

select
  pm.id,
  pm.code,
  pm.name,
  pms.store_code,
  pms.enabled,
  pms.updated_at
from public.pos_menus pm
left join public.pos_menu_store_scopes pms
  on pms.menu_id = pm.id
where lower(pm.name) like '%soy sauce chicken%'
order by pm.code, pms.store_code;
