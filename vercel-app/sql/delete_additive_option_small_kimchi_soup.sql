-- 추가형 옵션 "ADD ON / Small Kimchi Soup" 등 제거 후 재등록용
-- Supabase SQL Editor에서 실행. 먼저 SELECT로 대상 확인 후 DELETE 실행.

-- 1) 대상 확인 (이름에 kimchi·soup 또는 ADD ON 이 포함된 추가형 옵션)
SELECT id, menu_id, name, option_type, item_code, additive_source_menu_id, sort_order
FROM pos_menu_options
WHERE COALESCE(option_type, 'substitution') = 'additive'
  AND (
    name ILIKE '%Small Kimchi Soup%'
    OR name ILIKE '%kimchi%soup%'
    OR (name ILIKE '%ADD ON%' AND name ILIKE '%kimchi%')
  );

-- 2) 위에서 본 id로 삭제 (pos_menu_ingredients에 option_id FK가 있으면 먼저 지우거나 CASCADE 여부 확인)
--    옵션 전용 재료가 있으면 함께 삭제
DELETE FROM pos_menu_ingredients
WHERE option_id IN (
  SELECT id FROM pos_menu_options
  WHERE COALESCE(option_type, 'substitution') = 'additive'
    AND (
      name ILIKE '%Small Kimchi Soup%'
      OR name ILIKE '%kimchi%soup%'
      OR (name ILIKE '%ADD ON%' AND name ILIKE '%kimchi%')
    )
);

DELETE FROM pos_menu_options
WHERE COALESCE(option_type, 'substitution') = 'additive'
  AND (
    name ILIKE '%Small Kimchi Soup%'
    OR name ILIKE '%kimchi%soup%'
    OR (name ILIKE '%ADD ON%' AND name ILIKE '%kimchi%')
  );

-- 3) (선택) 토핑용으로만 쓰던 단독 POS 메뉴 행도 지울 경우 — 메뉴 코드/이름 확인 후 실행
-- SELECT id, code, name FROM pos_menus WHERE name ILIKE '%Small Kimchi Soup%' OR name ILIKE '%kimchi%soup%';
-- DELETE FROM pos_menus WHERE id = <확인한 id>;
--    주의: 다른 옵션이나 주문 이력이 참조하면 FK 오류 날 수 있음.
