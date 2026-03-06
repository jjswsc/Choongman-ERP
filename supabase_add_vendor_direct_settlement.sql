-- 거래처 직접정산 플래그 (지두방 등: 본사 미경유, 매장-거래처 직접 거래)
-- Supabase SQL Editor에서 실행
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS direct_settlement BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN vendors.direct_settlement IS '직접정산: 본사 재고/회계 제외, 매장-거래처 직접 거래 (지두방 등)';
