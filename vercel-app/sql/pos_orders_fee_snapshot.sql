-- POS 주문 시점 카드비·요금 스냅샷 (정산 시 GROSS/Fee 산출용)

ALTER TABLE IF EXISTS public.pos_orders
  ADD COLUMN IF NOT EXISTS card_fee_amt NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_mode TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_rate NUMERIC(8,4) DEFAULT 0;

COMMENT ON COLUMN public.pos_orders.card_fee_amt IS '결제 시점 카드 수수료(바트). computePosPricing.cardFeeAmt 스냅샷';
COMMENT ON COLUMN public.pos_orders.card_fee_mode IS 'included | separate';
COMMENT ON COLUMN public.pos_orders.card_rate IS '결제 시점 card_rate(%) 스냅샷';
