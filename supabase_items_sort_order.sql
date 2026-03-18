-- items 테이블에 sort_order 컬럼 추가
-- 엑셀(ไฟล์เช็คสต๊อก 등) 가져오기 시 행 순서대로 정렬하기 위함
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행

ALTER TABLE items ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT NULL;
COMMENT ON COLUMN items.sort_order IS '표시 순서. 엑셀 가져오기 시 행 순서로 설정. NULL이면 코드 기준 정렬';
CREATE INDEX IF NOT EXISTS idx_items_sort_order ON items(sort_order);
