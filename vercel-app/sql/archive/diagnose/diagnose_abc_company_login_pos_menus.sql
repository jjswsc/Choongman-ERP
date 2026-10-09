-- ABC Company + 매장 1001 로그인 기준 진단

-- 1) 회사·매장 tenant
SELECT id, company_name, is_active FROM public.tenants
WHERE id IN ('malatang01','abc-company') OR lower(company_name) LIKE '%abc%';

SELECT store_code, store_name, tenant_id, is_active
FROM public.erp_stores
WHERE trim(store_code) = '1001';

-- 2) admin 계정 tenant
SELECT id, name, nick, store, company, tenant_id, role, is_active
FROM public.employees
WHERE lower(trim(coalesce(nick, name, ''))) LIKE '%admin%'
   OR lower(trim(coalesce(company, ''))) LIKE '%abc%'
ORDER BY id
LIMIT 50;

-- 3) 메뉴 스코프 1001
SELECT m.code, m.name, m.tenant_id, m.is_active, m.category_main, m.category,
       m.sell_hall, m.sell_delivery, m.sell_packaging,
       s.store_code, s.enabled AS scope_enabled
FROM public.pos_menus m
LEFT JOIN public.pos_menu_store_scopes s
  ON s.menu_id = m.id AND lower(trim(s.store_code)) = '1001'
WHERE m.tenant_id = 'malatang01'
ORDER BY m.code;
