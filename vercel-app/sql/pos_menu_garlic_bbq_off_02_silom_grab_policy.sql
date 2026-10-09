-- 실롬 Grab 배달 정책 — 갈릭만 꺼졌는지, 재고 자동품절인지
-- 로직: lib/pos-delivery-policy.ts isMenuAvailableByDeliveryPolicy
-- store_code 후보: CM Silom / 1042

select
  pm.id,
  pm.code,
  pm.name,
  dmp.store_code,
  dmp.app_code,
  dmp.enabled,
  dmp.sold_out,
  dmp.stock_qty,
  dmp.auto_stop_on_zero,
  dmp.sell_start_time,
  dmp.sell_end_time,
  timezone('Asia/Bangkok', dmp.updated_at) as policy_updated_at_bkk,
  case
    when dmp.id is null then 'no_policy_row_default_on'
    when dmp.enabled is false then 'policy_disabled_hidden'
    when dmp.sold_out is true then 'policy_sold_out'
    when coalesce(dmp.auto_stop_on_zero, true)
      and dmp.stock_qty is not null
      and dmp.stock_qty <= 0
      then 'auto_stop_stock_zero'
    else 'policy_available'
  end as policy_reason
from public.pos_menus pm
left join public.pos_delivery_menu_policies dmp
  on dmp.menu_id = pm.id
 and dmp.app_code = 'grab'
 and (
   lower(replace(replace(btrim(dmp.store_code), '-', ''), ' ', ''))
     like '%silom%'
   or btrim(dmp.store_code) in ('1042', 'CM Silom')
 )
where
  upper(btrim(coalesce(pm.code, ''))) in ('C020', 'C021', 'C022', 'C023')
  or lower(pm.name) like '%garlic%bar.b.q%'
  or lower(pm.name) like '%bar.b.q%fried chicken%'
order by
  case when lower(pm.name) like '%garlic%' then 0 else 1 end,
  pm.code,
  dmp.store_code;
