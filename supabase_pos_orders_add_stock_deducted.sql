-- POS 주문 재고 차감 추적
CREATE TABLE IF NOT EXISTS pos_stock_deductions (
  order_id BIGINT NOT NULL PRIMARY KEY,
  deducted_at TIMESTAMPTZ DEFAULT NOW()
);
