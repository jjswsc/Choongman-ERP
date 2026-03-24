-- Campaign Hub extensions (hybrid attribution)
-- Run in Supabase SQL editor before enabling strict operations in production.

-- 1) Explicit campaign linkage for finance and POS attribution
ALTER TABLE IF EXISTS public.bank_transactions
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT NULL;

ALTER TABLE IF EXISTS public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT NULL;

ALTER TABLE IF EXISTS public.pos_orders
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT NULL;

-- 2) Helpful indexes for campaign-centric queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_campaign_id
  ON public.bank_transactions(marketing_campaign_id);

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_campaign_id
  ON public.petty_cash_transactions(marketing_campaign_id);

CREATE INDEX IF NOT EXISTS idx_pos_orders_campaign_id
  ON public.pos_orders(marketing_campaign_id);

-- 3) Optional FK (enable only if desired for strict integrity)
-- ALTER TABLE public.bank_transactions
--   ADD CONSTRAINT fk_bank_transactions_campaign
--   FOREIGN KEY (marketing_campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
-- ALTER TABLE public.petty_cash_transactions
--   ADD CONSTRAINT fk_petty_cash_transactions_campaign
--   FOREIGN KEY (marketing_campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
-- ALTER TABLE public.pos_orders
--   ADD CONSTRAINT fk_pos_orders_campaign
--   FOREIGN KEY (marketing_campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
