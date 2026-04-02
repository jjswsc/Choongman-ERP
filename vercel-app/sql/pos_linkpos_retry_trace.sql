-- KBTG LINKPOS (Retry Trace): 원시도 R1 ↔ 재시도 R1 연결 추적

alter table public.pos_payment_attempts
  add column if not exists retry_of_attempt_id bigint null references public.pos_payment_attempts(id) on delete set null,
  add column if not exists retry_of_local_tx_id text null;

create index if not exists ix_pos_payment_attempts_retry_of_attempt_id
  on public.pos_payment_attempts(retry_of_attempt_id);

create index if not exists ix_pos_payment_attempts_retry_of_local_tx_id
  on public.pos_payment_attempts(retry_of_local_tx_id);

