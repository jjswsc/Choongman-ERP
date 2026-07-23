-- Omni POS 매장 1001 에 malatang01 메뉴 노출 스코프 부여
-- (스코프 없으면 단말에서 카테고리만 보이고 메뉴 타일이 비어 있음)

-- 사전 확인: scope_1001 이 전부 0 이면 아래 INSERT 실행
SELECT
  m.id,
  m.code,
  m.name,
  count(s.menu_id) FILTER (
    WHERE coalesce(s.enabled, true) AND lower(trim(s.store_code)) = '1001'
  ) AS scope_1001
FROM public.pos_menus m
LEFT JOIN public.pos_menu_store_scopes s ON s.menu_id = m.id
WHERE m.tenant_id = 'malatang01'
  AND m.is_active IS DISTINCT FROM false
GROUP BY m.id, m.code, m.name
ORDER BY m.id;

-- 매장 1001 노출 추가 (이미 있으면 건너뜀)
INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
SELECT m.id, '1001', true
FROM public.pos_menus m
WHERE m.tenant_id = 'malatang01'
  AND m.is_active IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1
    FROM public.pos_menu_store_scopes s
    WHERE s.menu_id = m.id
      AND lower(trim(s.store_code)) = '1001'
  );

-- 확인
SELECT m.code, m.name, s.store_code, s.enabled
FROM public.pos_menus m
JOIN public.pos_menu_store_scopes s ON s.menu_id = m.id
WHERE m.tenant_id = 'malatang01'
  AND lower(trim(s.store_code)) = '1001'
ORDER BY m.code;
