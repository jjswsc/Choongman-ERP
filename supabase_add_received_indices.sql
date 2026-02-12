-- 일부 배송 완료 시 수령된 품목 인덱스 저장용
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_indices TEXT DEFAULT NULL;
