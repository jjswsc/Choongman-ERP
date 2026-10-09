-- ============================================================
-- pos_menus 코드를 대분류별 접두사로 정리
-- Chicken→C001, Korean→K001, Side→S001, Drinks→D001
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행
--
-- 사전: category_main 컬럼 및 값이 설정되어 있어야 함
--      (supabase_pos_menus_apply_category_presets_now.sql 실행 권장)
-- ============================================================

-- 0. code가 NULL 또는 빈 문자열인 행 선처리 (NOT NULL 제약 위반 방지)
UPDATE pos_menus SET code = 'M' || id::text
WHERE code IS NULL OR COALESCE(TRIM(code), '') = '';

-- 1. 임시 코드로 변경 (unique 제약 회피)
UPDATE pos_menus SET code = '__' || id::text 
WHERE category_main IN ('Chicken','Korean','Side','Drinks');

-- 2. 대분류별 순번 부여 후 최종 코드 적용
WITH numbered AS (
  SELECT id, category_main,
    CASE category_main
      WHEN 'Chicken' THEN 'C' || LPAD(ROW_NUMBER() OVER (PARTITION BY category_main ORDER BY id)::text, 3, '0')
      WHEN 'Korean'  THEN 'K' || LPAD(ROW_NUMBER() OVER (PARTITION BY category_main ORDER BY id)::text, 3, '0')
      WHEN 'Side'    THEN 'S' || LPAD(ROW_NUMBER() OVER (PARTITION BY category_main ORDER BY id)::text, 3, '0')
      WHEN 'Drinks'  THEN 'D' || LPAD(ROW_NUMBER() OVER (PARTITION BY category_main ORDER BY id)::text, 3, '0')
    END AS new_code
  FROM pos_menus
  WHERE code LIKE '__%'
)
UPDATE pos_menus m SET code = n.new_code
FROM numbered n WHERE m.id = n.id;
