-- POS 주문: 배달앱(플랫폼) 결제 금액 + 세부 채널 (Grab / Line Man / Shopee / Dine in)
-- Supabase SQL Editor에서 실행 후 배포.

ALTER TABLE IF EXISTS public.pos_orders
  ADD COLUMN IF NOT EXISTS payment_delivery_app numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_payment_channel text NULL;

COMMENT ON COLUMN public.pos_orders.payment_delivery_app IS '배달앱(플랫폼)으로 받은 결제 금액 합계';
COMMENT ON COLUMN public.pos_orders.delivery_payment_channel IS 'grab | lineman | shopee | dine_in (payment_delivery_app>0 일 때)';
