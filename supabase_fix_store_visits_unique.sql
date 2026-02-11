-- 방문시작/방문종료가 같은 (날짜,이름,매장)에 각각 1개씩 저장되도록 unique 제약 수정
-- 기존: (visit_date, name, store_name) - 방문시작/종료 둘 다 저장 시 충돌
-- 변경: (visit_date, name, store_name, visit_type) - 방문시작 1행, 방문종료 1행 허용

-- 1) 기존 제약 제거
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_key;
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_type_key;

-- 2) (date, name, store, visit_type) 중복 시 id 큰 것만 남기고 삭제
DELETE FROM store_visits a USING store_visits b
WHERE a.visit_date = b.visit_date AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, ''))
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND TRIM(COALESCE(a.visit_type, '')) = TRIM(COALESCE(b.visit_type, ''))
  AND a.id < b.id;

-- 3) 새 unique 제약 추가 (visit_type 포함)
ALTER TABLE store_visits ADD CONSTRAINT store_visits_date_name_store_type_key 
  UNIQUE (visit_date, name, store_name, visit_type);
