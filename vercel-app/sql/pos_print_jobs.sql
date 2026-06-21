-- POS print jobs (kitchen/receipt) queue with state machine.
-- Run in Supabase SQL editor.

create table if not exists public.pos_print_jobs (
  id bigserial primary key,
  store_code text not null,
  order_id bigint null,
  order_no text null,
  job_type text not null default 'kitchen',
  station smallint null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  claimed_by text null,
  claimed_at timestamptz null,
  printed_at timestamptz null,
  failed_at timestamptz null,
  dedupe_key text null,
  payload_json jsonb null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_print_jobs_status_chk check (status in ('queued', 'claimed', 'printed', 'failed', 'cancelled')),
  constraint pos_print_jobs_job_type_chk check (job_type in ('kitchen', 'receipt'))
);

create unique index if not exists pos_print_jobs_dedupe_key_uidx
  on public.pos_print_jobs (dedupe_key)
  where dedupe_key is not null;

create index if not exists pos_print_jobs_store_status_created_at_idx
  on public.pos_print_jobs (store_code, status, created_at);

create index if not exists pos_print_jobs_order_id_idx
  on public.pos_print_jobs (order_id);

create or replace function public.touch_pos_print_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pos_print_jobs_updated_at on public.pos_print_jobs;
create trigger trg_pos_print_jobs_updated_at
before update on public.pos_print_jobs
for each row execute function public.touch_pos_print_jobs_updated_at();

-- 주방 인쇄 큐 enqueue — dedupe_key partial unique 충돌 시 DB ERROR 없이 무시
create or replace function public.enqueue_pos_print_job(
  p_store_code text,
  p_order_id bigint,
  p_order_no text,
  p_job_type text,
  p_station smallint,
  p_status text,
  p_dedupe_key text,
  p_payload_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_dedupe_key), '') = '' then
    insert into public.pos_print_jobs (
      store_code, order_id, order_no, job_type, station, status, dedupe_key, payload_json
    ) values (
      p_store_code, p_order_id, p_order_no, p_job_type, p_station, p_status, null, p_payload_json
    );
    return;
  end if;

  insert into public.pos_print_jobs (
    store_code, order_id, order_no, job_type, station, status, dedupe_key, payload_json
  ) values (
    p_store_code, p_order_id, p_order_no, p_job_type, p_station, p_status, p_dedupe_key, p_payload_json
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

grant execute on function public.enqueue_pos_print_job(
  text, bigint, text, text, smallint, text, text, jsonb
) to service_role;
