-- 수령 확인 시 조정된 받은 수량 저장용 (품목 인덱스 → 수량)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_qty_json TEXT DEFAULT NULL;
