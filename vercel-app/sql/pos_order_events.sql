-- POS order event ledger (append-only).
-- Run in Supabase SQL editor.

create table if not exists public.pos_order_events (
  id bigserial primary key,
  order_id bigint not null,
  order_no text null,
  store_code text null,
  event_type text not null,
  actor_name text null,
  actor_role text null,
  actor_store text null,
  actor_employee_code text null,
  actor_employee_id bigint null,
  source text null,
  reason text null,
  before_json jsonb null,
  after_json jsonb null,
  changed_fields_json jsonb null,
  idempotency_key text null,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists pos_order_events_idempotency_key_uidx
  on public.pos_order_events (idempotency_key)
  where idempotency_key is not null;

create index if not exists pos_order_events_order_event_at_idx
  on public.pos_order_events (order_id, event_at desc);

create index if not exists pos_order_events_store_event_at_idx
  on public.pos_order_events (store_code, event_at desc);

create or replace function public.block_pos_order_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'pos_order_events is append-only';
end;
$$;

drop trigger if exists trg_block_pos_order_events_update on public.pos_order_events;
create trigger trg_block_pos_order_events_update
before update on public.pos_order_events
for each row execute function public.block_pos_order_events_mutation();

drop trigger if exists trg_block_pos_order_events_delete on public.pos_order_events;
create trigger trg_block_pos_order_events_delete
before delete on public.pos_order_events
for each row execute function public.block_pos_order_events_mutation();
