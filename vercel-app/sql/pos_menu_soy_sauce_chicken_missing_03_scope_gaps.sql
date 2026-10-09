-- C010 Soy Sauce Chicken 매장 스코프 vs 운영 매장 목록
-- 스코프에 없는 매장 = 그 매장 POS에서 메뉴 숨김
-- 직원 수정 후에도 특정 매장만 안 보일 때 실행

with known_stores as (
  select distinct trim(store_code) as store_code
  from public.pos_menu_store_scopes
  where trim(coalesce(store_code, '')) <> ''
  union
  select distinct trim(store_code)
  from public.erp_stores
  where trim(coalesce(store_code, '')) <> ''
    and coalesce(is_active, true) = true
),
c010 as (
  select id, code, name
  from public.pos_menus
  where id = 25
     or upper(trim(code)) = 'C010'
  limit 1
)
select
  k.store_code,
  exists (
    select 1
    from public.pos_menu_store_scopes pms
    join c010 m on m.id = pms.menu_id
    where pms.enabled is distinct from false
      and lower(replace(replace(trim(pms.store_code), '-', ''), ' ', ''))
        = lower(replace(replace(trim(k.store_code), '-', ''), ' ', ''))
  ) as c010_visible_at_store
from known_stores k
order by c010_visible_at_store, k.store_code;
