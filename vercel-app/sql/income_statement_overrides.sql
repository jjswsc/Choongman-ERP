-- 손익계산서: 수동 매출·기초재고 오버라이드(팀 공유). Supabase SQL Editor에서 실행 후 API 사용.
-- RLS: 서버는 service_role로 접근 시 우회됨.

create table if not exists public.income_statement_overrides (
  id bigint generated always as identity primary key,
  year_month text not null,
  store_key text not null,
  sales_override_enabled boolean not null default false,
  sales_override_amount numeric not null default 0,
  beginning_inv_override_enabled boolean not null default false,
  beginning_inv_override_amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint income_statement_overrides_year_store_unique unique (year_month, store_key)
);

create index if not exists income_statement_overrides_store_key_idx
  on public.income_statement_overrides (store_key);

comment on table public.income_statement_overrides is 'P&L manual sales / beginning inventory overrides (shared across devices)';
