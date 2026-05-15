-- POS 메뉴 매장 스코프 백필
-- 목적:
-- - 기존 pos_menus 데이터를 매장 스코프 테이블(pos_menu_store_scopes)로 초기 이관
-- - 초기 배포 후 POS_MENU_SCOPE_COMPATIBILITY_MODE=0 전환 전 사용

BEGIN;

-- 1) 대상 매장 목록(프린터 설정 기준)
WITH target_stores AS (
  SELECT DISTINCT trim(store_code) AS store_code
  FROM public.pos_printer_settings
  WHERE trim(COALESCE(store_code, '')) <> ''
),
active_menus AS (
  SELECT id
  FROM public.pos_menus
  WHERE COALESCE(is_active, true) = true
)
INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
SELECT m.id, s.store_code, true
FROM active_menus m
CROSS JOIN target_stores s
ON CONFLICT (store_code, menu_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = NOW();

COMMIT;

-- 참고:
-- - 특정 매장만 선별 백필하려면 target_stores CTE를 WHERE store_code IN (...)로 제한
-- - 배포 직후에는 POS_MENU_SCOPE_COMPATIBILITY_MODE=1 유지,
--   현장 검증 후 0으로 전환 권장
