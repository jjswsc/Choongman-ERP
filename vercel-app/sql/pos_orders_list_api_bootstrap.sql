-- POS 터미널 주문 목록(getPosOrders) / 저장(savePosOrder) 공통 컬럼 — Supabase SQL Editor에서 1회 실행
-- 증상: 주문·인쇄는 되는데 홀·배달·포장 리스트가 전부 비어 있음 (API가 [] 반환)
-- payment_cash_tendered 만 추가하면 잠깐 되다가, 다른 컬럼이 없으면 다시 실패할 수 있음

-- pos_payment_cash_tendered.sql
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_cash_tendered NUMERIC(12,2) DEFAULT 0;

-- pos_multi_coupon.sql (applied_coupons)
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS applied_coupons jsonb;

-- pos_orders_service_amount_columns.sql
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS service_amt NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS service_reason TEXT;

-- pos_orders_payment_other_breakdown.sql
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_other_breakdown jsonb NULL;

-- pos_orders_delivery_app_code.sql
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_app_code text;

-- pos_orders_guest_count.sql
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS guest_count integer NOT NULL DEFAULT 0;
