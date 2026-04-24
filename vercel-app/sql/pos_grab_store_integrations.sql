-- Grab merchant <-> partner merchant integration status snapshot
create table if not exists public.pos_grab_store_integrations (
  id bigint generated always as identity primary key,
  grab_merchant_id text not null,
  partner_merchant_id text not null,
  integration_status text not null,
  last_request_id text null,
  last_message text null,
  payload_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_pos_grab_store_integrations_pair
  on public.pos_grab_store_integrations(grab_merchant_id, partner_merchant_id);

create index if not exists idx_pos_grab_store_integrations_status
  on public.pos_grab_store_integrations(integration_status);

create index if not exists idx_pos_grab_store_integrations_updated
  on public.pos_grab_store_integrations(updated_at desc);
