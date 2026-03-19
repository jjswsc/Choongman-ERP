-- 매출액 출금: 시재 테이블에 유형·대상일 추가 (idempotent)
-- Run on Supabase SQL editor.

-- 1) trans_type에 'sales_withdrawal' 허용 (기존 check 제거 후 재생성)
alter table if exists public.pos_till_transactions
  drop constraint if exists pos_till_transactions_trans_type_check;

alter table if exists public.pos_till_transactions
  add constraint pos_till_transactions_trans_type_check
  check (trans_type in ('deposit', 'withdrawal', 'sales_withdrawal'));

-- 2) 매출 대상일 (해당 날짜 현금 매출에 대한 출금일 때만 사용)
alter table if exists public.pos_till_transactions
  add column if not exists sales_date date null;

comment on column public.pos_till_transactions.sales_date is '매출액 출금 시 해당 현금 매출의 영업일(날짜)';
