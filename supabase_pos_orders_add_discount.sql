-- POS 주문 할인 컬럼 추가
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS discount_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT '';
