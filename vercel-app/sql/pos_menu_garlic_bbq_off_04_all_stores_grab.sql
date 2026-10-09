-- 갈릭 Bar.B.Q의 전 매장 Grab 정책 — 실롬만인지, 여러 매장인지
-- 로직: pos_delivery_menu_policies (store_code, app_code=grab)

select
  dmp.store_code,
  pm.code,
  pm.name,
  dmp.enabled,
  dmp.sold_out,
  dmp.stock_qty,
  dmp.auto_stop_on_zero,
  timezone('Asia/Bangkok', dmp.updated_at) as policy_updated_at_bkk
from public.pos_delivery_menu_policies dmp
join public.pos_menus pm on pm.id = dmp.menu_id
where dmp.app_code = 'grab'
  and (
    upper(btrim(coalesce(pm.code, ''))) = 'C023'
    or lower(pm.name) like '%garlic%bar.b.q%'
  )
order by
  dmp.sold_out desc,
  dmp.enabled,
  dmp.store_code;
