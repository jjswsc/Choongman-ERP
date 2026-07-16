-- 회계 PO(매장 발행) 미수금: 청구 주체 매장 (null = 본사)
alter table public.receivable_transactions add column if not exists creditor_store text;
create index if not exists idx_receivable_transactions_creditor_store
  on public.receivable_transactions (creditor_store)
  where creditor_store is not null and trim(creditor_store) <> '';
