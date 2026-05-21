-- 손님 영수증: 현금 받은 금액(거스름 계산용)
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_cash_tendered NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN pos_orders.payment_cash_tendered IS 'POS 현금 결제 시 손님이 건넨 금액(영수증 Paid Amount·Change 표시)';
