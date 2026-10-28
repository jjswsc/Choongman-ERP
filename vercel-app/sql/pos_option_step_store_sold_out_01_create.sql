-- 매장별 옵션 단계(부위 등) 품절 — 홀·포장·QR·회원 픽업
-- step_key='part', step_value='Wing' 등. sold_out_date 있으면 해당 매장 หน้าร้าน만 품절.
-- scope 기본 'store' (배달은 계속 판매). 행 삭제 = 판매 재개.
-- pos_orders / pos_menu_options 는 건드리지 않음.

create table if not exists public.pos_option_step_store_sold_out (
  store_code text not null,
  step_key text not null,
  step_value text not null,
  sold_out_date date not null,
  scope text not null default 'store',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_option_step_store_sold_out_pkey primary key (store_code, step_key, step_value),
  constraint pos_option_step_store_sold_out_scope_check check (scope in ('all', 'store'))
);

create index if not exists idx_pos_option_step_store_sold_out_store
  on public.pos_option_step_store_sold_out (store_code);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pos_option_step_store_sold_out_updated_at
  on public.pos_option_step_store_sold_out;
create trigger trg_pos_option_step_store_sold_out_updated_at
before update on public.pos_option_step_store_sold_out
for each row execute function public.set_row_updated_at();

alter table public.pos_option_step_store_sold_out enable row level security;

drop policy if exists "pos_option_step_store_sold_out_allow_public"
  on public.pos_option_step_store_sold_out;
create policy "pos_option_step_store_sold_out_allow_public"
  on public.pos_option_step_store_sold_out
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_option_step_store_sold_out
  to anon, authenticated;

notify pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_option_step_store_sold_out_01_create.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
