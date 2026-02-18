-- ============================================================
-- POS 배달·포장 수수료 - 설정 및 주문에 추가
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 1. 매장별 배달/포장 수수료 (pos_printer_settings)
ALTER TABLE pos_printer_settings
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;

ALTER TABLE pos_printer_settings
ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC DEFAULT 0;

-- 2. 주문별 수수료 기록 (pos_orders)
ALTER TABLE pos_orders
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;

ALTER TABLE pos_orders
ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC DEFAULT 0;
