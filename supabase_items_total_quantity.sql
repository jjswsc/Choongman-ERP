-- ============================================================
-- 품목: 총 수량 추가 - 원가 계산용 (판매가/총수량 → 단위당 원가)
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(12,4) DEFAULT NULL;

COMMENT ON COLUMN items.total_quantity IS '총 수량. 표준 단위 기준. 있으면 단위당 원가 = price/total_quantity. 없으면 기존 cost 사용';
COMMENT ON COLUMN items.cost IS '매입가 (총 금액). total_quantity와 함께 사용 시 단위당 원가 계산';
COMMENT ON COLUMN items.price IS '판매가. total_quantity 있으면 단위당 원가 = price/total_quantity (매장 입장)';
