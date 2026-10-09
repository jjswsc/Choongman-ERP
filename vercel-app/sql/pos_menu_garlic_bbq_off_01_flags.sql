-- 갈릭 Bar.B.Q가 그랩에 '이용 불가'로 보일 때 — 메뉴 본체 플래그
-- 같은 Bar.B.Q 형제(커리/간장/고추장)와 비교
-- 로직: lib/grab-menu-from-pos.ts 는 sold_out_date가 비어 있지 않으면 UNAVAILABLE (당일만 아님)

select
  id,
  code,
  name,
  is_active,
  sell_hall,
  sell_delivery,
  sell_packaging,
  sold_out_date,
  category_main,
  category,
  (timezone('Asia/Bangkok', now()))::date as bangkok_today,
  case
    when is_active is false then 'inactive_hidden_from_grab'
    when sell_delivery is false then 'delivery_off_hidden_from_grab'
    when sold_out_date is not null
      and btrim(sold_out_date::text) <> ''
      then 'sold_out_date_set_grab_unavailable'
    else 'should_be_available_unless_store_policy'
  end as grab_hide_reason
from public.pos_menus
where
  upper(btrim(coalesce(code, ''))) in ('C020', 'C021', 'C022', 'C023')
  or lower(name) like '%garlic%bar.b.q%'
  or lower(name) like '%bar.b.q%fried chicken%'
order by
  case when lower(name) like '%garlic%' then 0 else 1 end,
  code,
  id;
