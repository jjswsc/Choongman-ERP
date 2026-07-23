-- ABC Company / 매장 1001 / 메뉴 malatang01 로 완전 정렬

-- 1) 매장·직원·메뉴 tenant 통일
UPDATE public.erp_stores
SET tenant_id = 'malatang01'
WHERE trim(store_code) = '1001';

UPDATE public.employees
SET tenant_id = 'malatang01'
WHERE lower(trim(coalesce(company, ''))) = 'abc company'
   OR (lower(trim(coalesce(name, ''))) = 'admin' AND trim(coalesce(store, '')) = '1001')
   OR lower(trim(coalesce(tenant_id, ''))) = 'abc-company';

UPDATE public.pos_menus
SET tenant_id = 'malatang01'
WHERE lower(trim(coalesce(tenant_id, ''))) IN ('', 'abc-company');

-- 2) 매장 1001 노출 스코프
INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
SELECT m.id, '1001', true
FROM public.pos_menus m
WHERE m.tenant_id = 'malatang01'
  AND m.is_active IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_menu_store_scopes s
    WHERE s.menu_id = m.id AND lower(trim(s.store_code)) = '1001'
  );

-- 3) 확인 (이 결과가 맞아야 함)
SELECT 'store' AS k, store_code AS a, tenant_id AS b FROM public.erp_stores WHERE trim(store_code)='1001'
UNION ALL
SELECT 'menu_tenants', coalesce(tenant_id,'(null)'), count(*)::text FROM public.pos_menus GROUP BY tenant_id
UNION ALL
SELECT 'scope1001', count(*)::text, '' FROM public.pos_menu_store_scopes WHERE lower(trim(store_code))='1001';
