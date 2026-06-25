-- 통장 출금 ↔ 패티캐시 보충(replenish) 연동
-- Supabase SQL Editor에서 1회 실행 (idempotent)

ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS bank_transaction_id BIGINT NULL;

COMMENT ON COLUMN public.petty_cash_transactions.bank_transaction_id IS
  '통장 이체 보충 연동 시 원본 bank_transactions.id';

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_bank_transaction_id
  ON public.petty_cash_transactions(bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;
