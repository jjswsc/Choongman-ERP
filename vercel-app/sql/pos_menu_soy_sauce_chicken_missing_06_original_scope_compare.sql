-- ORIGINAL 치킨·반반·Currycane의 매장 스코프 행 수 비교
-- C010만 매장 지정이 있고 나머지(C011 등)는 0건이면,
-- POS는 C010만 매장 필터를 타고 나머지는 전 매장 노출(호환 모드)입니다.
-- 로직: app/api/getPosMenus/route.ts shouldMenuBeVisibleForStore

select
  pm.id,
  pm.code,
  pm.name,
  pm.category,
  pm.sell_delivery,
  pm.is_active,
  count(pms.store_code) filter (where pms.enabled is distinct from false) as scoped_store_cnt
from public.pos_menus pm
left join public.pos_menu_store_scopes pms
  on pms.menu_id = pm.id
where
  upper(trim(pm.code)) in ('C010', 'C011', 'C012', 'C013', 'C024')
  or lower(pm.name) like '%currycane%'
group by
  pm.id,
  pm.code,
  pm.name,
  pm.category,
  pm.sell_delivery,
  pm.is_active
order by pm.code;
