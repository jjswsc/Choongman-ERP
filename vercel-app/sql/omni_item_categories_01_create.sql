-- Omni: 품목 관리 > Category Settings (PGRST205)
-- 증상: Could not find the table 'public.item_categories' in the schema cache
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 않는 것을 권장합니다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.item_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE public.item_categories ALTER COLUMN sort_order SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_item_categories_sort ON public.item_categories (sort_order);
CREATE INDEX IF NOT EXISTS idx_item_categories_tenant_id ON public.item_categories (tenant_id);

DO $$
BEGIN
  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS ux_item_categories_tenant_name
      ON public.item_categories (coalesce(tenant_id, ''), lower(trim(name)))
      WHERE trim(coalesce(name, '')) <> ''
  $idx$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ux_item_categories_tenant_name skipped: %', SQLERRM;
END $$;

COMMENT ON TABLE public.item_categories IS
  '재고 품목 카테고리 (품목 관리 > Category Settings). Omni는 tenant_id 단위로 격리';

ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.item_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.item_categories TO postgres;

DO $$
BEGIN
  IF to_regclass('public.item_categories_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.item_categories_id_seq TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.item_categories_id_seq TO postgres';
  END IF;
END $$;

-- 기본 카테고리만 넣음 (기존 items.category 는 가져오지 않음)
-- Store Only: 테넌트별 1개
DO $$
BEGIN
  BEGIN
    IF to_regclass('public.tenants') IS NULL THEN
      INSERT INTO public.item_categories (name, sort_order)
      SELECT 'Store Only', 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.item_categories c
        WHERE lower(trim(c.name)) = 'store only'
          AND coalesce(c.tenant_id, '') = ''
      );
    ELSE
      INSERT INTO public.item_categories (name, sort_order, tenant_id)
      SELECT 'Store Only', 0, NULLIF(TRIM(t.id), '')
      FROM public.tenants t
      WHERE NULLIF(TRIM(t.id), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.item_categories c
          WHERE lower(trim(c.name)) = 'store only'
            AND coalesce(c.tenant_id, '') = coalesce(NULLIF(TRIM(t.id), ''), '')
        );
    END IF;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
