-- 배달 주문의 플랫폼 코드(Grab, lineman 등). 신규 주문은 API에서 채움. 기존 데이터는 items_json에서 집계 API가 보조 추출.
alter table if exists public.pos_orders
  add column if not exists delivery_app_code text;

comment on column public.pos_orders.delivery_app_code is 'order_type=delivery일 때 배달앱 코드(pos_delivery_apps.code와 동일 권장).';

create index if not exists idx_pos_orders_delivery_app_code
  on public.pos_orders (delivery_app_code)
  where delivery_app_code is not null and trim(delivery_app_code) <> '';
