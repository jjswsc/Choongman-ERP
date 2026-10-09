-- POS Line Man 배달 화면 ORIGINAL에 Soy Sauce Chicken이 안 보일 때
-- 활성/채널/품절/소분류를 한 번에 확인
-- 로직: app/pos/order/page.tsx filteredMenus (is_active, sold_out_date, sell_delivery)

select
  id,
  code,
  name,
  is_active,
  category_main,
  category,
  sell_hall,
  sell_delivery,
  sell_packaging,
  sold_out_date,
  (timezone('Asia/Bangkok', now()))::date as bangkok_today,
  case
    when is_active is false then 'inactive'
    when sold_out_date is not null
      and left(sold_out_date::text, 10) = to_char(timezone('Asia/Bangkok', now()), 'YYYY-MM-DD')
      then 'sold_out_today'
    when sell_delivery is false then 'delivery_off'
    when lower(btrim(coalesce(category, ''))) <> 'original' then 'other_subcategory'
    else 'should_show_on_delivery_original'
  end as pos_hide_reason
from public.pos_menus
where
  lower(name) like '%soy sauce chicken%'
  or (
    lower(btrim(coalesce(category_main, ''))) = 'chicken'
    and lower(btrim(coalesce(category, ''))) = 'original'
  )
order by
  case when lower(name) like '%soy sauce chicken%' then 0 else 1 end,
  sort_order,
  name;
