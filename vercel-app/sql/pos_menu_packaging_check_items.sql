-- 메뉴/옵션별 포장·배달 체크리스트 항목
create table if not exists public.pos_menu_packaging_check_items (
  id bigserial primary key,
  menu_id bigint not null references public.pos_menus(id) on delete cascade,
  option_id bigint null references public.pos_menu_options(id) on delete cascade,
  order_type text not null default 'both',
  item_name text not null,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pos_menu_packaging_check_items
  drop constraint if exists pos_menu_packaging_check_items_order_type_check;

alter table public.pos_menu_packaging_check_items
  add constraint pos_menu_packaging_check_items_order_type_check
  check (order_type in ('takeout', 'delivery', 'both'));

create index if not exists idx_pos_menu_packaging_check_items_menu_option_type_active
  on public.pos_menu_packaging_check_items(menu_id, option_id, order_type, is_active);

create index if not exists idx_pos_menu_packaging_check_items_menu_sort
  on public.pos_menu_packaging_check_items(menu_id, sort_order, id);
