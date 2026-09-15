-- Omni: sauces / sauce_ingredients 생성 확인 (01 실행 후)
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 기대: sauces_exists / sauce_ingredients_exists 가 테이블명으로 나오고,
--       sauces_cols 에 usage_kind, linked_item_code 가 포함되어야 함

SELECT
  to_regclass('public.sauces') AS sauces_exists,
  to_regclass('public.sauce_ingredients') AS sauce_ingredients_exists,
  (
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sauces'
  ) AS sauces_cols,
  (
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sauce_ingredients'
  ) AS sauce_ingredients_cols;
