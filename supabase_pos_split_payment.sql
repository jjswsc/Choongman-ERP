-- ============================================================
-- POS 분할 결제 - 주문별 결제 수단 기록
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_cash NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_card NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_qr NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_other NUMERIC(12,2) DEFAULT 0;
