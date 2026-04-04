-- Generic API request idempotency key registry
-- Used by high-risk write APIs (inventory/accounting/settlement/purchase)

create table if not exists public.api_request_idempotency_keys (
  id bigserial primary key,
  scope text not null,
  key_hash text not null,
  key_preview text null,
  payload_json jsonb null,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_api_request_idempotency_scope_key_hash
  on public.api_request_idempotency_keys(scope, key_hash);

create index if not exists ix_api_request_idempotency_created_at
  on public.api_request_idempotency_keys(created_at);
