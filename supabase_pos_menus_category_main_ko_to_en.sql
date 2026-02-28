-- ============================================================
-- pos_menus 대분류 한글 → 영어 마이그레이션
-- 기존 데이터가 한글 대분류(치킨, 한식, 사이드, 음료)인 경우 영어로 변환
--
-- 실행: 기존 pos_menus 또는 system_settings(pos_menu_categories)에
--       한글 대분류가 있다면 실행
-- ============================================================

-- pos_menus 테이블
UPDATE pos_menus SET category_main = 'Chicken' WHERE category_main = '치킨';
UPDATE pos_menus SET category_main = 'Korean' WHERE category_main = '한식';
UPDATE pos_menus SET category_main = 'Side' WHERE category_main = '사이드';
UPDATE pos_menus SET category_main = 'Drinks' WHERE category_main = '음료';

-- system_settings의 pos_menu_categories JSON 마이그레이션
-- mainCategories 배열 요소 및 categoriesByMain 객체 키를 한글→영어로 교체
UPDATE system_settings
SET value_json = jsonb_build_object(
  'mainCategories', (
    SELECT jsonb_agg(
      CASE elem
        WHEN '치킨' THEN 'Chicken'::jsonb
        WHEN '한식' THEN 'Korean'::jsonb
        WHEN '사이드' THEN 'Side'::jsonb
        WHEN '음료' THEN 'Drinks'::jsonb
        ELSE to_jsonb(elem::text)
      END
    )
    FROM jsonb_array_elements_text(value_json->'mainCategories') AS elem
  ),
  'categoriesByMain', (
    SELECT jsonb_object_agg(
      CASE k
        WHEN '치킨' THEN 'Chicken'
        WHEN '한식' THEN 'Korean'
        WHEN '사이드' THEN 'Side'
        WHEN '음료' THEN 'Drinks'
        ELSE k
      END,
      v
    )
    FROM jsonb_each(COALESCE(value_json->'categoriesByMain', '{}'::jsonb)) AS t(k, v)
  )
)
WHERE key = 'pos_menu_categories'
  AND value_json IS NOT NULL
  AND (
    value_json::text LIKE '%치킨%'
    OR value_json::text LIKE '%한식%'
    OR value_json::text LIKE '%사이드%'
    OR value_json::text LIKE '%음료%'
  );
