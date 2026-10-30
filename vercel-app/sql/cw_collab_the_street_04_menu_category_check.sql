-- 2/2 조회 — The Street 카트 메뉴(삼겹살 콤보·SEOUL 세트) 대분류
-- 이것만 복사 → Run. UPDATE 없음.
-- category_main = Promotion 이면 협업 scope 에 Promotion 이 있어야 할인이 붙음.

SELECT
  id,
  code,
  name,
  category_main,
  category,
  CASE
    WHEN lower(trim(COALESCE(category_main, ''))) IN ('promotion', '프로모션')
      THEN 'promotion: needs Promotion in collab scope'
    ELSE 'non-promotion: check scope mains match this category_main'
  END AS collab_hint
FROM pos_menus
WHERE name ILIKE '%Samgyeopsal%Pork%Belly%Combo%'
   OR name ILIKE '%SEOUL%'
   OR name ILIKE '%삼겹%'
ORDER BY category_main, name
LIMIT 50;
