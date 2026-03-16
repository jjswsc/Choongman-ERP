-- Expense management MVP schema
-- Run on Supabase SQL editor (idempotent).

-- 1) Master table for non-logistics accrued expenses (planned payable)
create table if not exists public.expense_accruals (
  id bigserial primary key,
  payee_code text not null,
  payee_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  due_date date null,
  memo text null,
  account_subject_id bigint null,
  store_name text null,
  status text not null default 'planned',
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expense_accruals_expense_date on public.expense_accruals(expense_date);
create index if not exists idx_expense_accruals_due_date on public.expense_accruals(due_date);
create index if not exists idx_expense_accruals_payee_code on public.expense_accruals(payee_code);

-- 1-1) Approval workflow columns for planned -> approved -> paid
alter table public.expense_accruals
  add column if not exists approved_by text null,
  add column if not exists approved_role text null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approval_note text null,
  add column if not exists rejected_by text null,
  add column if not exists rejected_role text null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_note text null;

create index if not exists idx_expense_accruals_status on public.expense_accruals(status);
create index if not exists idx_expense_accruals_approved_at on public.expense_accruals(approved_at);

-- 2) Extend payable transactions for expense/payments linkage
alter table public.payable_transactions
  add column if not exists expense_accrual_id bigint null,
  add column if not exists petty_cash_transaction_id bigint null,
  add column if not exists account_subject_id bigint null,
  add column if not exists expense_date date null,
  add column if not exists due_date date null;

-- Optional FK (safe to run repeatedly)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payable_transactions_expense_accrual_id_fkey'
  ) then
    alter table public.payable_transactions
      add constraint payable_transactions_expense_accrual_id_fkey
      foreign key (expense_accrual_id)
      references public.expense_accruals(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_payable_transactions_expense_accrual_id on public.payable_transactions(expense_accrual_id);
create index if not exists idx_payable_transactions_petty_cash_transaction_id on public.payable_transactions(petty_cash_transaction_id);
