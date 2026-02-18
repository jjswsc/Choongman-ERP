-- ============================================================
-- POS 주문 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- POS 주문
CREATE TABLE IF NOT EXISTS pos_orders (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT NOT NULL,
  store_code TEXT DEFAULT '',
  order_type TEXT DEFAULT 'dine_in',
  table_name TEXT DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_orders_order_no ON pos_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created ON pos_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_store ON pos_orders(store_code);
