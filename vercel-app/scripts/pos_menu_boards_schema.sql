create table if not exists public.pos_menu_boards (
  id bigserial primary key,
  store_code text not null,
  board_type text not null,
  board_name text not null,
  group_grid_cols integer not null default 5,
  group_grid_rows integer not null default 2,
  menu_grid_cols integer not null default 5,
  menu_grid_rows integer not null default 5,
  resolution_width integer not null default 1024,
  resolution_height integer not null default 768,
  group_count integer not null default 0,
  menu_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_menu_boards_unique_name
  on public.pos_menu_boards (store_code, board_type, board_name);
