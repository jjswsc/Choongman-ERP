-- KBTG LINKPOS (Phase 1): 결제 시도 로그 + 주문 최종 승인 메타

create table if not exists public.pos_payment_attempts (
  id bigserial primary key,
  order_id bigint null references public.pos_orders(id) on delete set null,
  local_tx_id text not null,
  provider text not null default 'kbtg_linkpos',
  mode text not null default 'hypercom',
  tx_code text not null,
  bank_id text null,
  request_amount numeric(12,2) not null default 0,
  approved_amount numeric(12,2) not null default 0,
  request_raw text null,
  response_raw text null,
  response_code text null,
  approval_code text null,
  trace_no text null,
  terminal_id text null,
  merchant_id text null,
  response_text text null,
  status text not null default 'pending',
  error_reason text null,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_pos_payment_attempts_local_tx_id
  on public.pos_payment_attempts(local_tx_id);

create index if not exists ix_pos_payment_attempts_order_id
  on public.pos_payment_attempts(order_id);

create index if not exists ix_pos_payment_attempts_created_at
  on public.pos_payment_attempts(created_at desc);

alter table public.pos_orders
  add column if not exists linkpos_provider text null,
  add column if not exists linkpos_mode text null,
  add column if not exists linkpos_tx_code text null,
  add column if not exists linkpos_bank_id text null,
  add column if not exists linkpos_response_code text null,
  add column if not exists linkpos_approval_code text null,
  add column if not exists linkpos_trace_no text null,
  add column if not exists linkpos_ref_no text null,
  add column if not exists linkpos_terminal_id text null,
  add column if not exists linkpos_merchant_id text null,
  add column if not exists linkpos_reference1 text null,
  add column if not exists linkpos_requested_amount numeric(12,2) null,
  add column if not exists linkpos_approved_amount numeric(12,2) null,
  add column if not exists linkpos_requested_at timestamptz null,
  add column if not exists linkpos_responded_at timestamptz null;
