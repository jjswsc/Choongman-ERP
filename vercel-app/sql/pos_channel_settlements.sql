-- 채널 정산(카드·배달앱): NET 입금 + 수수료로 1130 소거

CREATE TABLE IF NOT EXISTS public.pos_channel_settlements (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL,
  settle_date DATE NOT NULL,
  channel TEXT NOT NULL,
  gross_amt NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_amt >= 0),
  fee_amt NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amt >= 0),
  net_amt NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_amt >= 0),
  fee_source TEXT NULL,
  memo TEXT NULL,
  bank_transaction_id BIGINT NULL,
  journal_entry_id BIGINT NULL,
  posted_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_code, settle_date, channel)
);

CREATE INDEX IF NOT EXISTS idx_pos_channel_settlements_store_date
  ON public.pos_channel_settlements(store_code, settle_date);

COMMENT ON TABLE public.pos_channel_settlements IS 'POS 채널 정산: gross=fee+net, journal clears 1130';
