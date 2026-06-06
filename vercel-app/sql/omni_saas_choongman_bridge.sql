-- Omni (SaaS) → Choongman POS 스키마 브릿지
-- 선행: saas_base_schema.sql 또는 saas_full_bootstrap_one_shot.sql
-- 다음: supabase_migration_consolidated.sql → supabase_one_paste_all_in_one.sql → phase2
--
-- ⚠️ Omni Supabase에는 supabase_schema.sql 을 돌리지 마세요 (SaaS 테이블과 충돌)

-- pos_orders: SaaS(store_name) → Choongman(store_code + POS 컬럼)
DO $$
BEGIN
  IF to_regclass('public.pos_orders') IS NULL THEN
    RAISE NOTICE 'skip: public.pos_orders not found';
    RETURN;
  END IF;

  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS store_code TEXT DEFAULT '';
  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine_in';
  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS table_name TEXT DEFAULT '';
  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS items_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;
  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS vat NUMERIC(12,2) DEFAULT 0;
  ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) DEFAULT 0;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_name'
  ) THEN
    UPDATE public.pos_orders
    SET store_code = COALESCE(NULLIF(trim(store_name), ''), store_code, '')
    WHERE store_code IS NULL OR trim(store_code) = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'total_amount'
  ) THEN
    UPDATE public.pos_orders
    SET total = COALESCE(total, total_amount, 0)
    WHERE COALESCE(total, 0) = 0 AND COALESCE(total_amount, 0) <> 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'payload'
  ) THEN
    UPDATE public.pos_orders
    SET items_json = COALESCE(
      payload->>'items',
      CASE WHEN payload IS NOT NULL THEN payload::text END,
      '[]'
    )
    WHERE items_json IS NULL OR trim(items_json) IN ('', '[]', 'null');
  END IF;
END $$;

-- pos_settlements: 레거시에 store_code 없을 때
DO $$
BEGIN
  IF to_regclass('public.pos_settlements') IS NOT NULL THEN
    ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS store_code TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- vendors: SaaS에는 code 없음 → migration_consolidated UNIQUE(code) 선행
DO $$
BEGIN
  IF to_regclass('public.vendors') IS NOT NULL THEN
    ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS code TEXT;
    UPDATE public.vendors SET code = 'VND-' || id::text
    WHERE code IS NULL OR btrim(code) = '';
  END IF;
END $$;

-- 확인 (스키마 변경 없음)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_code'
  ) AS pos_orders_has_store_code,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_name'
  ) AS pos_orders_has_store_name;
