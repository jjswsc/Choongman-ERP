-- Omni: Category Settings를 기본값 Store Only만 남김
-- 기존 품목에서 가져온 카테고리 행은 삭제합니다. items 테이블 값은 건드리지 않습니다.
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run

BEGIN;

DELETE FROM public.item_categories;

DO $$
BEGIN
  BEGIN
    IF to_regclass('public.tenants') IS NULL THEN
      INSERT INTO public.item_categories (name, sort_order)
      VALUES ('Store Only', 0);
    ELSE
      INSERT INTO public.item_categories (name, sort_order, tenant_id)
      SELECT 'Store Only', 0, NULLIF(TRIM(t.id), '')
      FROM public.tenants t
      WHERE NULLIF(TRIM(t.id), '') IS NOT NULL;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

COMMIT;
