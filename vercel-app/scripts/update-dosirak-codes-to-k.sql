-- 도시락 3개 메뉴 코드를 k로 시작하도록 변경 (한식 분류용)
-- Supabase SQL Editor에서 실행하세요.
-- 실행 전: SELECT id, code, name FROM pos_menus WHERE name IN ('Buldak Dosirak', 'Gochujang Bulgogi Dosirak', 'Soy Sauce Bulgogi Dosirak'); 로 확인

UPDATE pos_menus SET code = 'k001' WHERE name = 'Buldak Dosirak';
UPDATE pos_menus SET code = 'k002' WHERE name = 'Gochujang Bulgogi Dosirak';
UPDATE pos_menus SET code = 'k003' WHERE name = 'Soy Sauce Bulgogi Dosirak';

-- 실행 후 확인
-- SELECT id, code, name FROM pos_menus WHERE code LIKE 'k%';

-- ============================================================
-- 치킨: 코드가 c로 시작하는 메뉴 대분류를 Chicken으로 일괄 변경
-- Supabase SQL Editor에서 실행하세요.
-- 실행 전: SELECT id, code, name, category_main FROM pos_menus WHERE LOWER(code) LIKE 'c%'; 로 확인
-- ============================================================

UPDATE pos_menus SET category_main = 'Chicken' WHERE LOWER(TRIM(code)) LIKE 'c%';

-- 실행 후 확인
-- SELECT id, code, name, category_main FROM pos_menus WHERE LOWER(code) LIKE 'c%';
