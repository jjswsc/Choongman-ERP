-- POS 매장 1001 에서 메뉴가 안 보일 때 진단
-- Omni: pos_menu_store_scopes 에 매장이 없으면 단말에 미노출

-- 1) 매장 1001 tenant
SELECT store_code, store_name, tenant_id, is_active
FROM public.erp_stores
WHERE trim(store_code) = '1001'
   OR lower(trim(coalesce(store_code, ''))) LIKE '%1001%';

-- 2) malatang01 메뉴 + 매장 스코프
SELECT
  m.id,
  m.code,
  m.name,
  m.category_main,
  m.tenant_id,
  m.is_active,
  count(s.menu_id) FILTER (
    WHERE coalesce(s.enabled, true)
      AND lower(trim(s.store_code)) = '1001'
  ) AS scope_1001,
  coalesce(
    array_agg(DISTINCT s.store_code) FILTER (WHERE coalesce(s.enabled, true)),
    '{}'
  ) AS all_scopes
FROM public.pos_menus m
LEFT JOIN public.pos_menu_store_scopes s ON s.menu_id = m.id
WHERE m.tenant_id = 'malatang01'
GROUP BY m.id, m.code, m.name, m.category_main, m.tenant_id, m.is_active
ORDER BY m.id;

-- 3) 스코프 행 전체 (1001 관련)
SELECT menu_id, store_code, enabled
FROM public.pos_menu_store_scopes
WHERE lower(trim(store_code)) = '1001'
ORDER BY menu_id;
