-- ============================================================
-- 품목 표준 단위 (재고/사용/원가 통일)
-- 표준 단위 목록: (총 수량) [단위] = 1 규격 → 입력 ÷ 총 수량 = 규격 수
-- 사용법: Supabase SQL Editor에서 실행.
-- ============================================================

-- 표준 단위 목록. JSON 배열: [{ "unit": "ea", "total_quantity": 200 }, { "unit": "kg", "total_quantity": 10 }]
-- total_quantity = 해당 단위 N개가 1 규격 (예: 200 ea = 1 규격 → 50 입력 시 50÷200 = 0.25 규격)
ALTER TABLE items ADD COLUMN IF NOT EXISTS standard_units JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN items.standard_units IS '표준 단위 목록. [{ unit, total_quantity }] = (total_quantity) [unit] = 1 규격. 재고조사/사용/원가에서 선택';
