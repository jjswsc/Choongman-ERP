-- 카드 관리 스키마
-- Run on Supabase SQL editor (idempotent).
-- 통장에서 카드로 이체(충전)한 금액과 카드 사용 내역을 별도 관리

-- 1) 카드 계정 (회사카드, 개인카드 등)
create table if not exists public.card_accounts (
  id bigserial primary key,
  name text not null,
  store text null,
  memo text null,
  card_number text null,
  holder_name text null,
  card_company text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 테이블에 컬럼 추가 (이미 있으면 무시)
alter table public.card_accounts add column if not exists card_number text null;
alter table public.card_accounts add column if not exists holder_name text null;
alter table public.card_accounts add column if not exists card_company text null;

-- 2) 카드 거래 (충전/이체 또는 사용)
create table if not exists public.card_transactions (
  id bigserial primary key,
  card_account_id bigint not null,
  trans_date date not null,
  trans_type text not null check (trans_type in ('charge', 'expense')),
  amount numeric(14,2) not null check (amount > 0),
  memo text null,
  -- charge(충전) 시: 통장 이체 연동
  bank_transaction_id bigint null,
  -- expense(사용) 시: 지출 정보
  vendor_code text null,
  account_subject_id bigint null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_transactions_card_account_fkey foreign key (card_account_id) references public.card_accounts(id) on delete cascade
);

create index if not exists idx_card_transactions_card_account_id on public.card_transactions(card_account_id);
create index if not exists idx_card_transactions_trans_date on public.card_transactions(trans_date);
create index if not exists idx_card_transactions_trans_type on public.card_transactions(trans_type);

comment on table public.card_accounts is '카드 계정 (회사카드, 개인카드 등)';
comment on table public.card_transactions is '카드 거래: charge=통장→카드 이체/충전, expense=카드 사용';
