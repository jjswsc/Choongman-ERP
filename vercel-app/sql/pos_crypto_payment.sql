-- POS 암호화폐 결제 (전 매장 기본 OFF)
-- 시드/백필로 crypto_payment_enabled 를 true 로 올리지 않음.

ALTER TABLE public.pos_payment_settings
  ADD COLUMN IF NOT EXISTS crypto_payment_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.pos_payment_settings
  ADD COLUMN IF NOT EXISTS crypto_wallets jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_payment_settings
  ADD COLUMN IF NOT EXISTS crypto_assets_enabled jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_payment_settings
  ADD COLUMN IF NOT EXISTS crypto_rate_source text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.pos_payment_settings.crypto_payment_enabled IS
  '매장 암호화폐 결제 마스터. 기본 false. true여도 crypto_assets_enabled 코인을 켜야 POS 탭이 보임.';
COMMENT ON COLUMN public.pos_payment_settings.crypto_wallets IS
  '입금 주소만. 키: usdt_trc20, usdt_erc20, usdc_erc20, btc, eth. 개인키 금지.';
COMMENT ON COLUMN public.pos_payment_settings.crypto_assets_enabled IS
  '코인별 ON/OFF JSON. 기본 {}. 없는 키는 false.';
COMMENT ON COLUMN public.pos_payment_settings.crypto_rate_source IS
  'manual | coingecko. 꺼진 매장·attempt 미생성 시 환율 API 호출 없음.';

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS payment_crypto numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS payment_crypto_meta jsonb;

COMMENT ON COLUMN public.pos_orders.payment_crypto IS '암호화폐 결제 THB. 기본 0.';
COMMENT ON COLUMN public.pos_orders.payment_crypto_meta IS
  'asset, network, amountThb, amountCrypto, rateThb, walletAddress, attemptId, txHash, confirmMode';

ALTER TABLE public.pos_settlements
  ADD COLUMN IF NOT EXISTS crypto_amt numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_settlements.crypto_amt IS '결산 암호화폐 실입금 THB.';

CREATE TABLE IF NOT EXISTS public.pos_crypto_payment_attempts (
  id bigserial PRIMARY KEY,
  store_code text NOT NULL,
  order_id bigint NULL REFERENCES public.pos_orders (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'seen', 'confirmed', 'expired', 'cancelled')),
  asset text NOT NULL,
  network text NOT NULL,
  wallet_address text NOT NULL,
  amount_thb numeric(12, 2) NOT NULL DEFAULT 0,
  amount_crypto numeric(24, 10) NOT NULL DEFAULT 0,
  rate_thb numeric(18, 6),
  tx_hash text,
  confirmations integer NOT NULL DEFAULT 0,
  confirmed_by text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_crypto_attempts_tx_hash
  ON public.pos_crypto_payment_attempts (tx_hash)
  WHERE tx_hash IS NOT NULL AND length(trim(tx_hash)) > 0;

CREATE INDEX IF NOT EXISTS ix_pos_crypto_attempts_store_status
  ON public.pos_crypto_payment_attempts (store_code, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_pos_crypto_attempts_order_id
  ON public.pos_crypto_payment_attempts (order_id);

ALTER TABLE public.pos_crypto_payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all pos_crypto_payment_attempts" ON public.pos_crypto_payment_attempts;
CREATE POLICY "Allow all pos_crypto_payment_attempts"
  ON public.pos_crypto_payment_attempts
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.pos_crypto_payment_attempts TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pos_crypto_payment_attempts_id_seq TO anon, authenticated;
