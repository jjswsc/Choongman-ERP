-- Omni / 부분 스키마 Supabase — supabase_schema.sql 실행 전 (idempotent)
--
-- 언제 Run?
--   items·vendors·store_settings 가 "있는데 code 컬럼만 없을 때"만
-- 테이블 자체가 없으면 → 이 파일 Skip, supabase_schema.sql 부터 Run
--
-- 증상: ERROR 42703 column "code" does not exist (CREATE IF NOT EXISTS 스킵 후)

DO $$
BEGIN
  IF to_regclass('public.items') IS NOT NULL THEN
    ALTER TABLE public.items ADD COLUMN IF NOT EXISTS code TEXT;
    UPDATE public.items SET code = 'ITEM-' || id::text
    WHERE code IS NULL OR btrim(code) = '';
  ELSE
    RAISE NOTICE 'skip: public.items not found';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.vendors') IS NOT NULL THEN
    ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS code TEXT;
    UPDATE public.vendors SET code = 'VND-' || id::text
    WHERE code IS NULL OR btrim(code) = '';
  ELSE
    RAISE NOTICE 'skip: public.vendors not found';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.store_settings') IS NOT NULL THEN
    ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS code TEXT;
    UPDATE public.store_settings SET code = 'SS-' || id::text
    WHERE code IS NULL OR btrim(code) = '';
  ELSE
    RAISE NOTICE 'skip: public.store_settings not found';
  END IF;
END $$;

-- 확인용 (스키마 변경 없음)
SELECT
  t.table_name,
  to_regclass('public.' || t.table_name) IS NOT NULL AS table_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = t.table_name
      AND col.column_name = 'code'
  ) AS has_code_column
FROM (VALUES ('items'), ('vendors'), ('store_settings')) AS t(table_name);
