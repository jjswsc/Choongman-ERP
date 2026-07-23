-- 배포 후 POS 메뉴 안 보일 때: tenant 를 malatang01 로 통일 + 매장 1001 스코프 확보

-- 1) 메뉴·매장 tenant 통일
UPDATE public.pos_menus
SET tenant_id = 'malatang01'
WHERE lower(trim(coalesce(tenant_id, ''))) IN ('', 'abc-company');

UPDATE public.erp_stores
SET tenant_id = 'malatang01'
WHERE trim(store_code) = '1001'
  AND lower(trim(coalesce(tenant_id, ''))) IN ('', 'abc-company');

-- 2) 매장 1001 노출 (없을 때만)
INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
SELECT m.id, '1001', true
FROM public.pos_menus m
WHERE m.tenant_id = 'malatang01'
  AND m.is_active IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_menu_store_scopes s
    WHERE s.menu_id = m.id AND lower(trim(s.store_code)) = '1001'
  );

-- 3) 확인
SELECT 'menus' AS kind, coalesce(tenant_id,'(null)') AS tenant_id, count(*)::int AS n
FROM public.pos_menus GROUP BY 2
UNION ALL
SELECT 'store1001', coalesce(tenant_id,'(null)'), 1
FROM public.erp_stores WHERE trim(store_code) = '1001'
UNION ALL
SELECT 'scope1001', 'rows', count(*)::int
FROM public.pos_menu_store_scopes WHERE lower(trim(store_code)) = '1001';

SELECT id, code, name, category_main, category, tenant_id
FROM public.pos_menus
WHERE tenant_id = 'malatang01'
ORDER BY code;
