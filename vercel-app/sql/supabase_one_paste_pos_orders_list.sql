-- 이 파일은 §(3)만 분리한 축약본입니다.
-- 전체(회계+POS+메뉴)는 아래 한 파일만 실행하세요:
--   sql/supabase_one_paste_accounting_and_pos_printer_cut_clean.sql

ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_cash_tendered NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS applied_coupons JSONB;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS service_amt NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS service_reason TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_other_breakdown JSONB;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_app_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_delivery_app NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_payment_channel TEXT;
