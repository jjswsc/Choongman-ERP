-- ============================================================
-- items 중복 제거 후 유니크 제약 추가 (23505 오류 나면 이걸 먼저 실행)
-- Supabase SQL Editor에 붙여넣기 → Run → 완료 후 supabase_apply_dedup_and_unique.sql 전체 실행
-- ============================================================

DELETE FROM items
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn
    FROM items
  ) t
  WHERE rn > 1
);

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_key;
ALTER TABLE items ADD CONSTRAINT items_code_key UNIQUE (code);
