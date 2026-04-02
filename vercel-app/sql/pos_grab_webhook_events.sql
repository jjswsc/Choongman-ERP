-- Grab webhook idempotency / audit table
create table if not exists public.pos_grab_webhook_events (
  id bigint generated always as identity primary key,
  event_kind text not null,
  unique_key text not null,
  request_id text null,
  job_id text null,
  order_id text null,
  merchant_id text null,
  partner_merchant_id text null,
  payload_json jsonb null,
  received_at timestamptz not null default now()
);

create unique index if not exists uq_pos_grab_webhook_events_kind_key
  on public.pos_grab_webhook_events(event_kind, unique_key);

create index if not exists idx_pos_grab_webhook_events_received_at
  on public.pos_grab_webhook_events(received_at desc);

create index if not exists idx_pos_grab_webhook_events_request_id
  on public.pos_grab_webhook_events(request_id);

create index if not exists idx_pos_grab_webhook_events_order_id
  on public.pos_grab_webhook_events(order_id);

