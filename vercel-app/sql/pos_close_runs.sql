-- POS close engine runs.

create table if not exists public.pos_close_runs (
  id bigserial primary key,
  store_code text not null,
  business_date date not null,
  status text not null default 'draft',
  checks_json jsonb not null default '{}'::jsonb,
  totals_json jsonb not null default '{}'::jsonb,
  settlement_ref bigint null,
  posted_journal_entry_id bigint null,
  validated_at timestamptz null,
  finalized_at timestamptz null,
  finalized_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_close_runs_status_chk check (status in ('draft', 'validated', 'locked', 'posted')),
  constraint pos_close_runs_uniq unique (store_code, business_date)
);

create index if not exists pos_close_runs_status_idx
  on public.pos_close_runs (status, business_date desc);

create or replace function public.touch_pos_close_runs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pos_close_runs_updated_at on public.pos_close_runs;
create trigger trg_pos_close_runs_updated_at
before update on public.pos_close_runs
for each row execute function public.touch_pos_close_runs_updated_at();
