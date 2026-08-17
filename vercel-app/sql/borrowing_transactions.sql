-- 차입금 보조원장 (임원 등 관련당사자). 미수금 receivable_transactions 와 분리.
-- 한 번만 실행. 재무상태표 2150 대사에 사용.

CREATE TABLE IF NOT EXISTS public.borrowing_transactions (
  id BIGSERIAL PRIMARY KEY,
  party_code TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  trans_date DATE NOT NULL,
  memo TEXT,
  ref_type TEXT NOT NULL,
  bank_transaction_id BIGINT,
  petty_cash_transaction_id BIGINT,
  store_name TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT borrowing_transactions_ref_type_chk
    CHECK (ref_type IN ('Borrow', 'Repay', 'Opening'))
);

CREATE INDEX IF NOT EXISTS idx_borrowing_tx_party_date
  ON public.borrowing_transactions (party_code, trans_date);

CREATE INDEX IF NOT EXISTS idx_borrowing_tx_bank_id
  ON public.borrowing_transactions (bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_borrowing_tx_petty_id
  ON public.borrowing_transactions (petty_cash_transaction_id)
  WHERE petty_cash_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_borrowing_tx_tenant
  ON public.borrowing_transactions (tenant_id);

ALTER TABLE public.borrowing_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.borrowing_transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.borrowing_transactions_id_seq TO service_role;

COMMENT ON TABLE public.borrowing_transactions IS
  '임원 등 관련당사자 차입 보조원장. amount + = 차입 수령(Borrow/Opening), − = 상환(Repay). GL 2150 대사.';
