-- POS 메뉴 매장 노출 범위 (Omni 등 미배포 DB용 DDL)
-- 증상: 「메뉴 저장은 완료되었지만 매장 노출 범위 저장에 실패했습니다. DB 스키마를 확인해 주세요.」
--
-- Supabase SQL Editor에 붙여넣어 실행한 뒤, 필요 시:
--   sql/pos_menu_store_scope_backfill.sql 로 전체 매장 노출 백필

create table if not exists public.pos_menu_store_scopes (
  menu_id bigint not null references public.pos_menus(id) on delete cascade,
  store_code text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_menu_store_scopes_pkey primary key (store_code, menu_id)
);

create index if not exists idx_pos_menu_store_scopes_menu_id
  on public.pos_menu_store_scopes (menu_id);

create index if not exists idx_pos_menu_store_scopes_store_enabled
  on public.pos_menu_store_scopes (store_code, enabled)
  where enabled = true;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_menu_store_scopes_updated_at on public.pos_menu_store_scopes;
create trigger trg_pos_menu_store_scopes_updated_at
before update on public.pos_menu_store_scopes
for each row execute function public.set_row_updated_at();

alter table public.pos_menu_store_scopes enable row level security;

drop policy if exists "pos_menu_store_scopes_allow_public" on public.pos_menu_store_scopes;
create policy "pos_menu_store_scopes_allow_public"
  on public.pos_menu_store_scopes
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_menu_store_scopes to anon, authenticated;
