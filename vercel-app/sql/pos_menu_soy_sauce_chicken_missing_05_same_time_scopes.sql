-- 2026-09-16 11:00~13:00(방콕) 동안 매장 스코프가 다시 쓰인 메뉴
-- 같은 초에 여러 메뉴가 바뀌면 일괄/배포 쪽, C010만이면 그 메뉴 저장 1회
-- 로직: lib/pos-menu-upsert-server.ts pos_menu_store_scopes DELETE 후 INSERT

select
  pm.code,
  pm.name,
  count(*) as store_cnt,
  min(timezone('Asia/Bangkok', pms.updated_at)) as scope_updated_at_bkk
from public.pos_menu_store_scopes pms
join public.pos_menus pm on pm.id = pms.menu_id
where pms.updated_at >= timestamptz '2026-09-16 11:00:00+07'
  and pms.updated_at <  timestamptz '2026-09-16 13:00:00+07'
group by pm.code, pm.name
order by scope_updated_at_bkk, pm.code;
