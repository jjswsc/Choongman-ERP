-- 전역 옵션그룹 마스터 + 메뉴 적용(참조형) 구조
-- - pos_option_groups: 그룹 마스터
-- - pos_option_group_items: 그룹 내부 항목(치킨무/김치/단무지 등)
-- - pos_menu_option_group_links: 메뉴에 어떤 그룹을 어떤 채널/순서/가격으로 적용할지

create table if not exists public.pos_option_groups (
  id bigserial primary key,
  group_key text not null unique,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_option_group_items (
  id bigserial primary key,
  group_id bigint not null references public.pos_option_groups(id) on delete cascade,
  item_name text not null,
  sort_order integer not null default 0,
  base_price_hall numeric(12,2) not null default 0,
  base_price_delivery numeric(12,2),
  sell_hall boolean not null default true,
  sell_delivery boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_menu_option_group_links (
  id bigserial primary key,
  menu_id bigint not null references public.pos_menus(id) on delete cascade,
  group_id bigint not null references public.pos_option_groups(id) on delete cascade,
  sort_order integer not null default 0,
  sell_hall boolean not null default true,
  sell_delivery boolean not null default true,
  price_hall_override numeric(12,2),
  price_delivery_override numeric(12,2),
  required boolean not null default true,
  min_select integer not null default 1,
  max_select integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_id, group_id)
);

create index if not exists idx_pos_option_groups_sort_order
  on public.pos_option_groups (sort_order asc, id asc);

create index if not exists idx_pos_option_group_items_group_sort
  on public.pos_option_group_items (group_id, sort_order asc, id asc);

create index if not exists idx_pos_menu_option_group_links_menu_sort
  on public.pos_menu_option_group_links (menu_id, sort_order asc, id asc);

create index if not exists idx_pos_menu_option_group_links_group
  on public.pos_menu_option_group_links (group_id, menu_id);

-- updated_at 자동 갱신
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_option_groups_updated_at on public.pos_option_groups;
create trigger trg_pos_option_groups_updated_at
before update on public.pos_option_groups
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_pos_option_group_items_updated_at on public.pos_option_group_items;
create trigger trg_pos_option_group_items_updated_at
before update on public.pos_option_group_items
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_pos_menu_option_group_links_updated_at on public.pos_menu_option_group_links;
create trigger trg_pos_menu_option_group_links_updated_at
before update on public.pos_menu_option_group_links
for each row execute function public.set_row_updated_at();

alter table public.pos_option_groups enable row level security;
alter table public.pos_option_group_items enable row level security;
alter table public.pos_menu_option_group_links enable row level security;

drop policy if exists "pos_option_groups_allow_public" on public.pos_option_groups;
create policy "pos_option_groups_allow_public"
  on public.pos_option_groups
  as permissive
  for all
  to public
  using (true)
  with check (true);

drop policy if exists "pos_option_group_items_allow_public" on public.pos_option_group_items;
create policy "pos_option_group_items_allow_public"
  on public.pos_option_group_items
  as permissive
  for all
  to public
  using (true)
  with check (true);

drop policy if exists "pos_menu_option_group_links_allow_public" on public.pos_menu_option_group_links;
create policy "pos_menu_option_group_links_allow_public"
  on public.pos_menu_option_group_links
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_option_groups to anon, authenticated;
grant select, insert, update, delete on table public.pos_option_group_items to anon, authenticated;
grant select, insert, update, delete on table public.pos_menu_option_group_links to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
