-- 갈릭 Bar.B.Q 매장 노출 스코프 — 실롬이 빠져 있으면 그 매장 POS에서만 숨김
-- Grab 메뉴 동기화는 스코프를 안 보고 전 메뉴를 보냄. 그랩 '이용 불가'의 직접 원인은 아님.

select
  pm.id,
  pm.code,
  pm.name,
  pms.store_code,
  pms.enabled,
  timezone('Asia/Bangkok', pms.updated_at) as scope_updated_at_bkk
from public.pos_menus pm
left join public.pos_menu_store_scopes pms
  on pms.menu_id = pm.id
where
  upper(btrim(coalesce(pm.code, ''))) in ('C020', 'C021', 'C022', 'C023')
  or lower(pm.name) like '%garlic%bar.b.q%'
order by
  case when lower(pm.name) like '%garlic%' then 0 else 1 end,
  pm.code,
  pms.store_code;
