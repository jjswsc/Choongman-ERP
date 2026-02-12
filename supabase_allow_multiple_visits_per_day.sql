-- 같은 날 같은 매장 여러 번 방문 허용
-- 기존: UNIQUE (visit_date, name, store_name, visit_type) - 하루에 같은 매장 1회만
-- 변경: 제약 제거 - 하루에 같은 매장 여러 번 방문 가능

ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_type_key;
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_key;
