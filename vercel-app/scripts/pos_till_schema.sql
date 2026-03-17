-- 시재(카운터 현금) 입출금 - 패티캐쉬와 별도
-- POS > 시재 관리에서 사용. Run on Supabase SQL editor (idempotent).

create table if not exists public.pos_till_transactions (
  id bigserial primary key,
  store_code text not null,
  trans_date date not null,
  trans_type text not null check (trans_type in ('deposit', 'withdrawal')),
  amount numeric(14,2) not null,
  memo text null,
  user_name text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_till_transactions_store_date
  on public.pos_till_transactions(store_code, trans_date);
