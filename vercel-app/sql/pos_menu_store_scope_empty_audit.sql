-- POS 메뉴 매장 스코프 미설정 점검
-- 증상: POS에는 메뉴가 보이는데 관리 화면 「노출 매장」 체크가 비어 있음
-- 원인: pos_menu_store_scopes 행 없음 + POS_MENU_SCOPE_COMPATIBILITY_MODE=1(기본) → 전 매장 노출
--
-- 앱: vercel-app/lib/pos-menu-store-scope.ts (shouldMenuBeVisibleForStore)

-- 1) 스코프 없는 활성 메뉴
select
  pm.id,
  pm.code,
  pm.name,
  pm.is_active,
  pm.category_main,
  pm.category
from public.pos_menus pm
where pm.is_active is distinct from false
  and not exists (
    select 1
    from public.pos_menu_store_scopes pms
    where pms.menu_id = pm.id
      and pms.enabled is distinct from false
  )
order by pm.id;

-- 2) 요약
select
  count(*) filter (where pm.is_active is distinct from false) as active_menus,
  count(*) filter (
    where pm.is_active is distinct from false
      and not exists (
        select 1 from public.pos_menu_store_scopes pms
        where pms.menu_id = pm.id and pms.enabled is distinct from false
      )
  ) as active_menus_without_scope,
  count(*) filter (
    where exists (
      select 1 from public.pos_menu_store_scopes pms
      where pms.menu_id = pm.id and pms.enabled is distinct from false
    )
  ) as menus_with_scope
from public.pos_menus pm;

-- 3) (선택) 전 매장 노출로 DB 일괄 백필 — vercel-app/sql/pos_menu_store_scope_backfill.sql
