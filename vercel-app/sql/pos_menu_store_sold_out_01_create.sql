-- 매장별 메뉴 품절 (홀·QR·POS)
-- sold_out_date 가 있으면 해당 매장만 품절. 행 삭제 = 판매 재개.
-- 전역 pos_menus.sold_out_date 와 분리 (매장 A 품절 ≠ 매장 B 판매)

create table if not exists public.pos_menu_store_sold_out (
  menu_id bigint not null references public.pos_menus(id) on delete cascade,
  store_code text not null,
  sold_out_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_menu_store_sold_out_pkey primary key (store_code, menu_id)
);

create index if not exists idx_pos_menu_store_sold_out_menu_id
  on public.pos_menu_store_sold_out (menu_id);

create index if not exists idx_pos_menu_store_sold_out_store
  on public.pos_menu_store_sold_out (store_code);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_menu_store_sold_out_updated_at on public.pos_menu_store_sold_out;
create trigger trg_pos_menu_store_sold_out_updated_at
before update on public.pos_menu_store_sold_out
for each row execute function public.set_row_updated_at();

alter table public.pos_menu_store_sold_out enable row level security;

drop policy if exists "pos_menu_store_sold_out_allow_public" on public.pos_menu_store_sold_out;
create policy "pos_menu_store_sold_out_allow_public"
  on public.pos_menu_store_sold_out
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_menu_store_sold_out to anon, authenticated;
