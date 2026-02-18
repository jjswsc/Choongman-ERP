-- ============================================================
-- POS 주문 - 손님 메모 컬럼 추가
-- Supabase SQL Editor에서 실행
-- ============================================================
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS memo TEXT DEFAULT '';
