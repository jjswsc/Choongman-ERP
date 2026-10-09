-- 품목 카테고리 관리 (품목 관리 > 카테고리 설정)
CREATE TABLE IF NOT EXISTS item_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_item_categories_sort ON item_categories(sort_order);

-- Packaging → Packing 변경: 기존 items.category 업데이트
UPDATE items SET category = 'Packing' WHERE category = 'Packaging';

-- item_categories 초기화: items의 distinct category (정규화 후)
INSERT INTO item_categories (name, sort_order)
SELECT DISTINCT v.name, 0
FROM (
  SELECT CASE
    WHEN TRIM(category) = '매장 전용' THEN 'Store Only'
    WHEN TRIM(category) = 'Packaging' THEN 'Packing'
    ELSE TRIM(category)
  END AS name
  FROM items
  WHERE category IS NOT NULL AND TRIM(category) != ''
) v
ON CONFLICT (name) DO NOTHING;

-- Store Only가 없으면 추가
INSERT INTO item_categories (name, sort_order) VALUES ('Store Only', 0)
ON CONFLICT (name) DO NOTHING;
