-- 프로모션 대분류 문자열: 한글 '프로모션' → 영문 'Promotion' (앱 상수 PROMOTION_MAIN_CATEGORY와 일치)
-- Supabase SQL Editor에서 1회 실행

update public.pos_menus
set category_main = 'Promotion'
where trim(category_main) = '프로모션';

update public.pos_promos
set category_main = 'Promotion'
where trim(category_main) = '프로모션';

-- system_settings.pos_menu_categories JSON의 mainCategories / categoriesByMain 키는
-- 관리 화면에서 카테고리 설정 저장 시 병합되거나, 필요 시 JSON 수동 편집
