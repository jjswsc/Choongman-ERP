-- POS 1001 메뉴 미표시 — tenant / category_main 확인

-- A) 매장 1001 의 tenant (POS·로그인과 맞아야 값)
SELECT store_code, store_name, tenant_id, is_active
FROM public.erp_stores
WHERE trim(store_code) = '1001';

-- B) 메뉴의 tenant + 대분류 (Bibimbap 탭 필터에 필요)
SELECT id, code, name, category_main, category, tenant_id, is_active,
       sell_hall, sell_delivery, sell_packaging
FROM public.pos_menus
WHERE id IN (1,2,3,4,5,10,11,12,13,14,16,24,25)
   OR tenant_id IN ('malatang01', 'abc-company')
ORDER BY id;

-- C) tenants 에 abc-company 행이 있는지
SELECT id, company_name, is_active
FROM public.tenants
WHERE id IN ('malatang01', 'abc-company')
   OR lower(company_name) LIKE '%abc%';
