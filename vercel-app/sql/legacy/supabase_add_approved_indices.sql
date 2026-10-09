-- 관리자 주문 승인 시 일부 품목만 선택한 경우 저장용
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_indices TEXT DEFAULT NULL;

-- 관리자 승인 시 수량 수정된 품목의 원본 수량 (인덱스 → 원본수량)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_original_qty_json TEXT DEFAULT NULL;
