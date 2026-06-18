-- ============================================================
-- omni_pos_choongman_parity.sql
-- Omni(SaaS) Supabase → 충만 POS API 호환 (한 번에 붙여넣기)
--
-- 선행: saas_full_bootstrap_one_shot.sql 또는 saas_base_schema + saas_tenant_bootstrap
-- ⚠️ 충만(레거시) DB에는 실행하지 마세요.
--
-- 포함:
--   · omni_saas_choongman_bridge (store_code/items_json 등)
--   · pos_orders 충만 필수 컬럼 + store_name NOT NULL 완화
--   · pos_orders_list_api_bootstrap + idempotency
--   · pos_settlements_bootstrap + align
--   · pos_orders RLS (존재 테이블만)
--   · erp_stores display_name/aliases (매장명↔store_code 매핑)
--
-- 장기(메뉴·프린터·Grab·회계 RPC): supabase_migration_consolidated → all_in_one → phase2
-- ============================================================

-- ── 1) pos_orders: SaaS → Choongman 브릿지 ──
DO $$
BEGIN
  IF to_regclass('public.pos_orders') IS NULL THEN
    RAISE NOTICE 'skip §1: public.pos_orders not found';
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

    UPDATE public.pos_orders
    SET store_name = COALESCE(NULLIF(trim(store_name), ''), NULLIF(trim(store_code), ''), '')
    WHERE store_name IS NULL OR trim(store_name) = '';

    ALTER TABLE public.pos_orders ALTER COLUMN store_name SET DEFAULT '';
    BEGIN
      ALTER TABLE public.pos_orders ALTER COLUMN store_name DROP NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'store_name DROP NOT NULL skipped: %', SQLERRM;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'total_amount'
  ) THEN
    UPDATE public.pos_orders
    SET total = COALESCE(NULLIF(total, 0), total_amount, 0)
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

-- ── 2) pos_orders: savePosOrder / getPosOrders 필수 컬럼 ──
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS memo TEXT DEFAULT '';
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS discount_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT '';
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_cash NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_card NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_qr NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_other NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS member_id BIGINT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS member_no TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS coupon_discount_amt NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS point_used NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS point_earned NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS card_fee_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS card_fee_mode TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS card_rate NUMERIC(8,4);

-- pos_orders_list_api_bootstrap + paid_at
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_cash_tendered NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS applied_coupons JSONB;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS service_amt NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS service_reason TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_other_breakdown JSONB;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_app_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS payment_delivery_app NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_payment_channel TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- LinkPOS (선택 — 컬럼 없으면 API가 strip)
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_provider TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_mode TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_tx_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_bank_id TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_response_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_approval_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_trace_no TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_ref_no TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_terminal_id TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_merchant_id TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_reference1 TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_requested_amount NUMERIC(12,2);
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_approved_amount NUMERIC(12,2);
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_requested_at TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS linkpos_responded_at TEXT;

-- idempotency (savePosOrder)
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS idempotency_key_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_orders_idempotency_key_hash
  ON public.pos_orders(idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_orders_store ON public.pos_orders(store_code);
CREATE INDEX IF NOT EXISTS idx_pos_orders_store_created_at
  ON public.pos_orders (store_code, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status_store_created_at
  ON public.pos_orders (status, store_code, created_at);

-- ── 3) pos_settlements (시재·영업 시작) ──
CREATE TABLE IF NOT EXISTS public.pos_settlements (
  id BIGSERIAL PRIMARY KEY,
  store_code TEXT NOT NULL DEFAULT '',
  settle_date DATE NOT NULL,
  cash_actual NUMERIC(12,2) DEFAULT NULL,
  cash_actual_denoms JSONB DEFAULT NULL,
  cash_amt NUMERIC(12,2) DEFAULT 0,
  card_amt NUMERIC(12,2) DEFAULT 0,
  card_breakdown JSONB DEFAULT '{}'::jsonb,
  qr_amt NUMERIC(12,2) DEFAULT 0,
  qr_breakdown JSONB DEFAULT '{}'::jsonb,
  delivery_app_amt NUMERIC(12,2) DEFAULT 0,
  delivery_app_breakdown JSONB DEFAULT '{}'::jsonb,
  dine_in_delivery_amt NUMERIC(12,2) DEFAULT 0,
  dine_in_delivery_breakdown JSONB DEFAULT '{}'::jsonb,
  other_amt NUMERIC(12,2) DEFAULT 0,
  other_breakdown JSONB DEFAULT '{}'::jsonb,
  memo TEXT DEFAULT '',
  closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_code, settle_date)
);

ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS store_code TEXT NOT NULL DEFAULT '';
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS cash_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS card_breakdown JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS delivery_app_breakdown JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS qr_breakdown JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS dine_in_delivery_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS dine_in_delivery_breakdown JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS other_breakdown JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settlements ADD COLUMN IF NOT EXISTS cash_actual_denoms JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_settlements_store ON public.pos_settlements(store_code);
CREATE INDEX IF NOT EXISTS idx_pos_settlements_date ON public.pos_settlements(settle_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_settlements_store_date
  ON public.pos_settlements (store_code, settle_date);

ALTER TABLE public.pos_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for pos_settlements" ON public.pos_settlements;
DROP POLICY IF EXISTS "Allow all for anon" ON public.pos_settlements;
CREATE POLICY "Allow all for pos_settlements"
  ON public.pos_settlements FOR ALL USING (true) WITH CHECK (true);

-- ── 4) pos_orders RLS (존재 테이블만) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_orders', 'pos_table_layouts', 'pos_menus', 'pos_menu_options',
    'pos_menu_ingredients', 'pos_promos', 'pos_promo_items'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow select pos_orders" ON public.pos_orders;
CREATE POLICY "Allow select pos_orders" ON public.pos_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
CREATE POLICY "Allow insert pos_orders" ON public.pos_orders FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
CREATE POLICY "Allow update pos_orders" ON public.pos_orders FOR UPDATE USING (true) WITH CHECK (true);

-- ── 5) erp_stores: 표시명·별칭 (JWT store=본사 ↔ POS store_code=HQ) ──
ALTER TABLE public.erp_stores ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.erp_stores ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

UPDATE public.erp_stores es
SET
  display_name = COALESCE(NULLIF(trim(es.display_name), ''), NULLIF(trim(es.store_name), ''), NULLIF(trim(es.store_code), ''), ''),
  aliases = (
    SELECT ARRAY(
      SELECT DISTINCT v FROM unnest(
        COALESCE(es.aliases, '{}'::text[]) ||
        ARRAY[
          NULLIF(trim(es.store_name), ''),
          NULLIF(trim(es.store_code), ''),
          NULLIF(trim(es.display_name), '')
        ]
      ) AS u(v)
      WHERE v IS NOT NULL AND trim(v) <> ''
    )
  )
WHERE to_regclass('public.erp_stores') IS NOT NULL;

-- POS 로그인·주문은 store_code(HQ) 기준 — 직원 store 필드 정렬(선택)
UPDATE public.employees e
SET store = es.store_code
FROM public.erp_stores es
WHERE trim(COALESCE(e.store, '')) = trim(COALESCE(es.store_name, ''))
  AND trim(COALESCE(es.store_code, '')) <> ''
  AND trim(COALESCE(e.store, '')) <> trim(es.store_code);

-- ── 6) vendors code (migration_consolidated 선행용) ──
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
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'items_json'
  ) AS pos_orders_has_items_json,
  to_regclass('public.pos_settlements') IS NOT NULL AS pos_settlements_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_orders' AND column_name = 'store_name'
      AND is_nullable = 'YES'
  ) AS store_name_nullable;
