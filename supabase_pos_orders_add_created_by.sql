-- POS 주문 담당자(결제한 직원) 저장 — 담당자별 조회용
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_pos_orders_created_by ON pos_orders(created_by);
