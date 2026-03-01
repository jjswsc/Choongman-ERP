-- ============================================================
-- 품목 재고 단위 설정 (방안 B: 기본 단위 + 조정 단위)
-- 재고는 기본 단위로만 저장. 조정/조사 시 box, Pack 등 선택 가능.
-- 사용법: Supabase SQL Editor에서 실행.
-- ============================================================

-- 재고 기본 단위 (저장 단위). 비어 있으면 기존 unit 사용
ALTER TABLE items ADD COLUMN IF NOT EXISTS stock_base_unit TEXT DEFAULT '';
COMMENT ON COLUMN items.stock_base_unit IS '재고 저장 단위(예: ea). 비어 있으면 unit 컬럼 사용';

-- 조정/조사 시 선택할 단위 목록. JSON 배열: [{ "unit": "box", "factor": 6 }, { "unit": "Pack", "factor": 1 }]
-- factor = 1 이 단위 = factor 개의 기본 단위
ALTER TABLE items ADD COLUMN IF NOT EXISTS stock_unit_options JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN items.stock_unit_options IS '조정 단위 옵션. [{ "unit": "box", "factor": 6 }] = 1box = 6 기본단위';
