-- Seacon QR에 Good Morning Deal 노출 원인 미리보기 (읽기 전용)
-- 1) 메뉴·스코프 2) Seacon QR 숨김 설정
-- pos_orders UPDATE 없음 — 영업 중 조회 가능

SELECT
  m.id AS menu_id,
  m.code,
  m.name,
  m.price,
  m.is_active,
  m.sell_hall,
  m.promo_id,
  m.category_main,
  m.category,
  coalesce(
    (
      SELECT string_agg(s.store_code, ', ' ORDER BY s.store_code)
      FROM public.pos_menu_store_scopes s
      WHERE s.menu_id = m.id
        AND s.enabled IS DISTINCT FROM false
    ),
    '(스코프 없음 → 충만 호환모드면 전 매장 노출)'
  ) AS scoped_stores,
  EXISTS (
    SELECT 1
    FROM public.pos_menu_store_scopes s
    WHERE s.menu_id = m.id
      AND s.enabled IS DISTINCT FROM false
      AND lower(replace(replace(replace(s.store_code, ' ', ''), '-', ''), '_', ''))
          LIKE '%seacon%'
  ) AS seacon_in_scope
FROM public.pos_menus m
WHERE m.is_active IS DISTINCT FROM false
  AND (
    m.name ILIKE '%Good Morning%'
    OR m.name ILIKE '%Morning Deal%'
  )
ORDER BY m.price, m.code, m.id;
