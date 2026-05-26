-- 반반 메뉴별 허용 맛(메뉴) whitelist
-- - 반반 메뉴와 일반 맛 메뉴를 직접 연결한다.
-- - 실제 반반 맛은 옵션 문자열이 아니라 pos_menus 행을 참조한다.

create table if not exists public.pos_banban_flavor_links (
  id bigserial primary key,
  banban_menu_id bigint not null references public.pos_menus(id) on delete cascade,
  flavor_menu_id bigint not null references public.pos_menus(id) on delete cascade,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_banban_flavor_links_unique unique (banban_menu_id, flavor_menu_id),
  constraint pos_banban_flavor_links_not_self check (banban_menu_id <> flavor_menu_id)
);

create index if not exists idx_pos_banban_flavor_links_banban_sort
  on public.pos_banban_flavor_links (banban_menu_id, sort_order asc, flavor_menu_id asc);

create index if not exists idx_pos_banban_flavor_links_flavor
  on public.pos_banban_flavor_links (flavor_menu_id, banban_menu_id);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_banban_flavor_links_updated_at on public.pos_banban_flavor_links;
create trigger trg_pos_banban_flavor_links_updated_at
before update on public.pos_banban_flavor_links
for each row execute function public.set_row_updated_at();

alter table public.pos_banban_flavor_links enable row level security;

drop policy if exists "pos_banban_flavor_links_allow_public" on public.pos_banban_flavor_links;
create policy "pos_banban_flavor_links_allow_public"
  on public.pos_banban_flavor_links
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_banban_flavor_links to anon, authenticated;
grant usage, select on sequence public.pos_banban_flavor_links_id_seq to anon, authenticated;
