-- checklist_items에 sort_order 컬럼 추가 (매장 점검 항목 순서 변경용)
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- 기존 데이터: item_id 기준으로 sort_order 채우기
UPDATE checklist_items SET sort_order = item_id WHERE sort_order IS NULL OR sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_checklist_items_sort ON checklist_items(sort_order);
