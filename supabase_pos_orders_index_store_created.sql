-- pos_orders: 매장 + 기간 조회 시 Disk I/O 절감 (getPosOrders, 매출 집계 등)
-- Supabase SQL Editor에서 필요 시 실행
CREATE INDEX IF NOT EXISTS idx_pos_orders_store_created
  ON pos_orders(store_code, created_at DESC);
