-- Omni: item_categories 생성 확인 (01 실행 후)
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 기대: item_categories_exists = item_categories, category_count = 테넌트 수(기본 Store Only 1개씩)

SELECT
  to_regclass('public.item_categories') AS item_categories_exists,
  (SELECT count(*) FROM public.item_categories) AS category_count;
