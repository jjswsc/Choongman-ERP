create table if not exists public.pos_menu_screen_configs (
  id bigserial primary key,
  store_code text null,
  main_category_font_size integer not null default 14,
  category_font_size integer not null default 13,
  menu_tile_font_size integer not null default 13,
  menu_tile_cols integer not null default 4,
  menu_list_font_size integer not null default 12,
  menu_list_page_size integer not null default 14,
  kiosk_group_font_size integer not null default 13,
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_menu_screen_configs_store_code_uidx
  on public.pos_menu_screen_configs ((coalesce(store_code, '')));
