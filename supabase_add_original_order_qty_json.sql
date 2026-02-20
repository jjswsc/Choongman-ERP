-- 수령 시 수량 조정 후 "원본 → 변경" 표시를 위해 원본 수량 보존
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_order_qty_json TEXT DEFAULT NULL;
