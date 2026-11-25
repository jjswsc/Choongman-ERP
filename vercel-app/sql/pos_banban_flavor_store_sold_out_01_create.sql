-- Banban(반반) 맛 전용 매장 품절 — 단품 치킨 판매와 분리
-- flavor_menu_id = 맛으로 고르는 pos_menus.id
-- scope=store → หน้าร้าน(POS·QR)만 Banban 피커에서 숨김 (Grab Banban은 유지)
-- scope=all → Grab Banban modifier 포함 전부 숨김
-- 행 삭제 = Banban 맛 다시 열기 (단품 sold_out 과는 무관)

create table if not exists public.pos_banban_flavor_store_sold_out (
  store_code text not null,
  flavor_menu_id bigint not null references public.pos_menus(id) on delete cascade,
  sold_out_date date not null,
  scope text not null default 'store',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_banban_flavor_store_sold_out_pkey primary key (store_code, flavor_menu_id),
  constraint pos_banban_flavor_store_sold_out_scope_check check (scope in ('all', 'store'))
);

create index if not exists idx_pos_banban_flavor_store_sold_out_store
  on public.pos_banban_flavor_store_sold_out (store_code);

create index if not exists idx_pos_banban_flavor_store_sold_out_flavor
  on public.pos_banban_flavor_store_sold_out (flavor_menu_id);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_banban_flavor_store_sold_out_updated_at
  on public.pos_banban_flavor_store_sold_out;
create trigger trg_pos_banban_flavor_store_sold_out_updated_at
before update on public.pos_banban_flavor_store_sold_out
for each row execute function public.set_row_updated_at();

alter table public.pos_banban_flavor_store_sold_out enable row level security;

drop policy if exists "pos_banban_flavor_store_sold_out_allow_public"
  on public.pos_banban_flavor_store_sold_out;
create policy "pos_banban_flavor_store_sold_out_allow_public"
  on public.pos_banban_flavor_store_sold_out
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_banban_flavor_store_sold_out
  to anon, authenticated;

notify pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_banban_flavor_store_sold_out_01_create.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
