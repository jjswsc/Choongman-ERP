-- 배달앱(Grab/LineMan/Shopee) 전용 메뉴 운영 정책
-- - 앱별 주문 수락 모드(수동/자동)
-- - 앱별 메뉴 노출/정렬/판매시간/재고/품절
-- - 앱별 카테고리 정렬

create table if not exists public.pos_delivery_app_policies (
  id bigserial primary key,
  store_code text not null,
  app_code text not null,
  enabled boolean not null default true,
  order_acceptance_mode text not null default 'manual',
  auto_accept_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_delivery_app_policies_app_check check (app_code in ('grab', 'lineman', 'shopee')),
  constraint pos_delivery_app_policies_acceptance_check check (order_acceptance_mode in ('manual', 'auto'))
);

create unique index if not exists pos_delivery_app_policies_store_app_uidx
  on public.pos_delivery_app_policies (store_code, app_code);

create table if not exists public.pos_delivery_menu_policies (
  id bigserial primary key,
  store_code text not null,
  app_code text not null,
  menu_id bigint not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  sell_start_time text null, -- HH:mm
  sell_end_time text null,   -- HH:mm
  stock_qty numeric(12, 3) null,
  sold_out boolean not null default false,
  auto_stop_on_zero boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_delivery_menu_policies_app_check check (app_code in ('grab', 'lineman', 'shopee'))
);

create unique index if not exists pos_delivery_menu_policies_store_app_menu_uidx
  on public.pos_delivery_menu_policies (store_code, app_code, menu_id);

create index if not exists pos_delivery_menu_policies_store_app_idx
  on public.pos_delivery_menu_policies (store_code, app_code);

create table if not exists public.pos_delivery_category_orders (
  id bigserial primary key,
  store_code text not null,
  app_code text not null,
  category_main text not null default '',
  category text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_delivery_category_orders_app_check check (app_code in ('grab', 'lineman', 'shopee'))
);

create unique index if not exists pos_delivery_category_orders_store_app_cat_uidx
  on public.pos_delivery_category_orders (store_code, app_code, category_main, category);

create index if not exists pos_delivery_category_orders_store_app_idx
  on public.pos_delivery_category_orders (store_code, app_code);
