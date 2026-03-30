-- 배합(sauces): 판매용(품목 연결 필수·원가 계산기에서 배합 선택) vs 매장용(연결 없음·계산기 매장용 전용 목록에서 배합 코드 선택)
-- Supabase SQL Editor에서 실행 후 배포

ALTER TABLE sauces
  ADD COLUMN IF NOT EXISTS usage_kind text NOT NULL DEFAULT 'for_sale';

ALTER TABLE sauces
  ADD COLUMN IF NOT EXISTS linked_item_code text;

COMMENT ON COLUMN sauces.usage_kind IS 'for_sale: must link items.code; blend selectable in calculator. store_use: no item link; blend via store-use picker only, not main blend list';
COMMENT ON COLUMN sauces.linked_item_code IS 'When usage_kind=for_sale, required reference to items.code; null for store_use';
