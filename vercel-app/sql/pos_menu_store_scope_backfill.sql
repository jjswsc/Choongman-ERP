-- POS 메뉴 매장 스코프 "전체 매장 노출" 백필
-- 목적:
-- - 메뉴별 매장 체크박스가 제각각인 상태를 일괄 정렬
-- - 모든 메뉴가 모든 매장에 노출되도록 pos_menu_store_scopes 를 강제 동기화
-- - 운영 중 긴급 완화용 (UI 전체 체크 + DB 백필 세트)

-- 환경마다 SQL 실행기가 문장을 분리 실행해도 동작하도록
-- 임시테이블/트랜잭션 의존 없이 단일 DO 블록으로 처리한다.
DO $$
BEGIN
  IF to_regclass('public.erp_stores') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
      SELECT m.id, s.store_code, true
      FROM public.pos_menus m
      CROSS JOIN (
        SELECT DISTINCT trim(store_code) AS store_code
        FROM public.erp_stores
        WHERE COALESCE(is_active, true) = true
          AND trim(COALESCE(store_code, '')) <> ''
      ) s
      ON CONFLICT (store_code, menu_id) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          updated_at = NOW()
    $sql$;
  END IF;

  IF to_regclass('public.employees') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
      SELECT m.id, s.store_code, true
      FROM public.pos_menus m
      CROSS JOIN (
        SELECT DISTINCT trim(store) AS store_code
        FROM public.employees
        WHERE trim(COALESCE(store, '')) <> ''
      ) s
      ON CONFLICT (store_code, menu_id) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          updated_at = NOW()
    $sql$;
  END IF;

  IF to_regclass('public.pos_printer_settings') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
      SELECT m.id, s.store_code, true
      FROM public.pos_menus m
      CROSS JOIN (
        SELECT DISTINCT trim(store_code) AS store_code
        FROM public.pos_printer_settings
        WHERE trim(COALESCE(store_code, '')) <> ''
      ) s
      ON CONFLICT (store_code, menu_id) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          updated_at = NOW()
    $sql$;
  END IF;

  IF to_regclass('public.pos_menu_store_scopes') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.pos_menu_store_scopes (menu_id, store_code, enabled)
      SELECT m.id, s.store_code, true
      FROM public.pos_menus m
      CROSS JOIN (
        SELECT DISTINCT trim(store_code) AS store_code
        FROM public.pos_menu_store_scopes
        WHERE trim(COALESCE(store_code, '')) <> ''
      ) s
      ON CONFLICT (store_code, menu_id) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          updated_at = NOW()
    $sql$;
  END IF;
END $$;

-- 참고:
-- - 특정 매장만 선별하려면 각 소스 서브쿼리에 WHERE store_code IN (...) 추가
-- - 특정 메뉴만 선별하려면 public.pos_menus m 에 WHERE id IN (...) 추가
-- - 본 스크립트는 "추가/활성화" 방식(UPSERT)이며, 기존 행 삭제는 하지 않음
