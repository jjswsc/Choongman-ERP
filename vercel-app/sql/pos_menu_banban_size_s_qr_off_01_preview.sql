-- Banban 사이즈 S — QR(홀)에 보이는지 확인
-- QR 게스트 주문은 sell_hall = true 인 메뉴·옵션만 담김 (lib/qr-table-server.ts)
-- 이 조회만 실행. 변경 없음.

select
  m.id as menu_id,
  m.code,
  m.name as menu_name,
  m.is_banban,
  m.is_active,
  m.sell_hall as menu_sell_hall,
  m.sell_delivery as menu_sell_delivery,
  m.sell_packaging as menu_sell_packaging,
  o.id as option_id,
  o.name as option_name,
  o.option_code,
  o.option_type,
  o.price_modifier,
  o.option_step_values,
  o.sell_hall as option_sell_hall,
  o.sell_delivery as option_sell_delivery,
  o.sell_packaging as option_sell_packaging
from public.pos_menus m
left join public.pos_menu_options o on o.menu_id = m.id
where
  m.is_banban is true
  or upper(btrim(coalesce(m.code, ''))) in ('C024', 'C24')
  or m.name ilike '%banban%'
  or m.name ilike '%반반%'
order by m.code, m.id, o.sort_order, o.id;
