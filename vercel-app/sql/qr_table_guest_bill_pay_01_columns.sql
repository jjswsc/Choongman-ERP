-- QR 테이블 게스트 잔액(전액) PromptPay 결제용 컬럼
alter table if exists public.pos_qr_table_sessions
  add column if not exists pending_bill_partner_txn_id text,
  add column if not exists pending_bill_amount numeric(12, 2) default 0;

comment on column public.pos_qr_table_sessions.pending_bill_partner_txn_id is
  'Guest table checkout PromptPay partner txn (full remaining balance)';
comment on column public.pos_qr_table_sessions.pending_bill_amount is
  'Amount for pending guest bill QR checkout';
