-- POS getPosMenus?storeCode=malatang01:1001 → 스코프 1001 불일치 수정
-- erp_stores.store_code 를 실제 매장코드 1001 로 맞춘다

-- 1) 현재 매장 키 확인
SELECT id, tenant_id, store_code, store_name, is_active
FROM public.erp_stores
WHERE tenant_id = 'malatang01'
   OR trim(coalesce(store_code, '')) IN ('1001', 'malatang01:1001')
   OR trim(coalesce(store_name, '')) = '1001'
   OR lower(trim(coalesce(store_code, ''))) LIKE 'malatang01%'
ORDER BY id;

-- 2) store_code 비었거나 tenant:name 합성키면 1001 로 교정
UPDATE public.erp_stores
SET store_code = '1001',
    tenant_id = coalesce(nullif(trim(tenant_id), ''), 'malatang01')
WHERE tenant_id = 'malatang01'
  AND (
    trim(coalesce(store_name, '')) = '1001'
    OR trim(coalesce(store_code, '')) IN ('', 'malatang01:1001')
    OR lower(trim(coalesce(store_code, ''))) = 'malatang01:1001'
  );

-- 직원 store 도 1001
UPDATE public.employees
SET store = '1001',
    tenant_id = coalesce(nullif(trim(tenant_id), ''), 'malatang01')
WHERE lower(trim(coalesce(company, ''))) = 'abc company'
  AND (
    trim(coalesce(store, '')) IN ('', 'malatang01:1001', 'malatang01')
    OR lower(trim(coalesce(store, ''))) LIKE 'malatang01:%'
    OR trim(coalesce(store, '')) = '1001'
  );

-- 3) 메뉴 스코프 1001 (및 잘못 생성된 합성키도 함께)
INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
SELECT m.id, '1001', true
FROM public.pos_menus m
WHERE m.tenant_id = 'malatang01'
  AND m.is_active IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_menu_store_scopes s
    WHERE s.menu_id = m.id AND lower(trim(s.store_code)) = '1001'
  );

-- 합성키로 박힌 스코프가 있으면 1001 로 옮김
UPDATE public.pos_menu_store_scopes
SET store_code = '1001'
WHERE lower(trim(store_code)) IN ('malatang01:1001', 'malatang01');

-- 4) 확인
SELECT id, tenant_id, store_code, store_name FROM public.erp_stores WHERE tenant_id = 'malatang01';
SELECT name, store, company, tenant_id FROM public.employees
WHERE lower(trim(coalesce(company,''))) = 'abc company';
SELECT store_code, count(*) FROM public.pos_menu_store_scopes
WHERE lower(trim(store_code)) IN ('1001', 'malatang01:1001')
GROUP BY 1;
