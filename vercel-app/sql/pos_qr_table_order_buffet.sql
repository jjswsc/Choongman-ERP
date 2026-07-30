-- QR 테이블오더 + 뷔페 티어 (Omni 파일럿)
-- Supabase SQL Editor에 붙여넣어 실행하세요.
-- DDL만 포함. 매장 enable·티어 시드는 별도 운영 SQL로.

-- 1) 테이블별 공개 QR 토큰
create table if not exists public.pos_table_qr_tokens (
  id bigserial primary key,
  store_code text not null,
  table_name text not null,
  token text not null,
  active boolean not null default true,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_table_qr_tokens_token_uidx
  on public.pos_table_qr_tokens (token);

create unique index if not exists pos_table_qr_tokens_active_store_table_uidx
  on public.pos_table_qr_tokens (store_code, table_name)
  where active = true;

create index if not exists pos_table_qr_tokens_store_idx
  on public.pos_table_qr_tokens (store_code);

-- 2) 매장별 QR 오더 정책
create table if not exists public.pos_qr_order_store_settings (
  store_code text primary key,
  enabled boolean not null default false,
  mode text not null default 'buffet'
    check (mode in ('buffet', 'a_la_carte', 'both')),
  entry_payment_mode text not null default 'postpay'
    check (entry_payment_mode in ('prepay', 'postpay', 'guest_choice')),
  extras_payment_mode text not null default 'postpay'
    check (extras_payment_mode in ('prepay', 'postpay', 'guest_choice')),
  require_staff_open boolean not null default true,
  max_open_minutes integer not null default 240,
  allow_reorder_after_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) 뷔페 티어
create table if not exists public.pos_buffet_tiers (
  id bigserial primary key,
  store_code text not null,
  code text not null,
  name_th text not null default '',
  name_en text not null default '',
  name_ko text not null default '',
  price_per_person numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_code, code)
);

create index if not exists pos_buffet_tiers_store_active_idx
  on public.pos_buffet_tiers (store_code, active, sort_order);

-- 4) 티어 ↔ 포함 메뉴
create table if not exists public.pos_buffet_tier_menus (
  tier_id bigint not null references public.pos_buffet_tiers (id) on delete cascade,
  menu_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (tier_id, menu_id)
);

create index if not exists pos_buffet_tier_menus_menu_idx
  on public.pos_buffet_tier_menus (menu_id);

-- 5) QR 테이블 세션
create table if not exists public.pos_qr_table_sessions (
  id bigserial primary key,
  store_code text not null,
  table_name text not null,
  token_id bigint references public.pos_table_qr_tokens (id) on delete set null,
  status text not null default 'awaiting_entry'
    check (status in ('awaiting_entry', 'active', 'closed', 'expired')),
  guest_count integer not null default 1,
  tier_id bigint references public.pos_buffet_tiers (id) on delete set null,
  tier_price_snapshot numeric(12, 2) not null default 0,
  entry_total numeric(12, 2) not null default 0,
  entry_payment_mode_resolved text not null default 'postpay'
    check (entry_payment_mode_resolved in ('prepay', 'postpay')),
  extras_payment_mode_resolved text not null default 'postpay'
    check (extras_payment_mode_resolved in ('prepay', 'postpay')),
  entry_paid boolean not null default false,
  entry_paid_at timestamptz,
  entry_payment_channel text
    check (entry_payment_channel is null or entry_payment_channel in ('qr', 'pos')),
  pos_order_id bigint,
  session_secret_hash text not null,
  opened_by text not null default 'guest_qr',
  pending_entry_partner_txn_id text,
  pending_extras_partner_txn_id text,
  pending_extras_amount numeric(12, 2),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_qr_table_sessions_store_table_status_idx
  on public.pos_qr_table_sessions (store_code, table_name, status);

create index if not exists pos_qr_table_sessions_pos_order_idx
  on public.pos_qr_table_sessions (pos_order_id)
  where pos_order_id is not null;

comment on table public.pos_table_qr_tokens is 'Public QR tokens for guest table order (/t/{token})';
comment on table public.pos_qr_order_store_settings is 'Per-store QR table order + buffet payment policy';
comment on table public.pos_buffet_tiers is 'Buffet price tiers (per person entry)';
comment on table public.pos_buffet_tier_menus is 'Menus included in a buffet tier (ordered at 0 price)';
comment on table public.pos_qr_table_sessions is 'Guest QR visit session linked to dine-in pos_orders';
