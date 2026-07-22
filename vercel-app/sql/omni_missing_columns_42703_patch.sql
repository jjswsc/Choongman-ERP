-- ============================================================
-- Omni Supabase — PostgREST 42703 (column does not exist) 패치
-- 프로젝트: zivwuwwffeqjshcprxlz (Omni)
-- ⚠️ 충만(레거시) DB에는 실행하지 마세요. (이미 있을 가능성 높음 / IF NOT EXISTS 안전)
--
-- 로그 기준 누락:
--   · stock_logs.is_deleted
--   · pos_menus.delivery_app_fee_percent
--   · pos_menu_ingredients.option_id
--   · items.unit
--   · erp_stores.photo_url (+ map_query, address)
--
-- 출처: stock_logs_soft_delete_outbound / pos_menus_delivery_app_fee_percent
--       / supabase_pos_menu_cost_and_options / erp_stores_member_portal_fields
-- ============================================================

-- 1) stock_logs — 출고 소프트 삭제
DO $$
BEGIN
  IF to_regclass('public.stock_logs') IS NULL THEN
    RAISE NOTICE 'skip §1: public.stock_logs not found';
    RETURN;
  END IF;

  ALTER TABLE public.stock_logs
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS delete_tx_id TEXT NULL;

  COMMENT ON COLUMN public.stock_logs.is_deleted IS
    '소프트 삭제 여부. true면 집계/조회/정산 기본 대상에서 제외';

  CREATE INDEX IF NOT EXISTS idx_stock_logs_active_log_type_date
    ON public.stock_logs(log_type, is_deleted, log_date DESC);
END $$;

-- 2) pos_menus — 배달앱 수수료(%)
DO $$
BEGIN
  IF to_regclass('public.pos_menus') IS NULL THEN
    RAISE NOTICE 'skip §2: public.pos_menus not found';
    RETURN;
  END IF;

  ALTER TABLE public.pos_menus
    ADD COLUMN IF NOT EXISTS delivery_app_fee_percent NUMERIC(5, 2);

  COMMENT ON COLUMN public.pos_menus.delivery_app_fee_percent IS
    '원가 분석용 배달앱 수수료(%). NULL이면 UI 기본 25%. 0 허용.';
END $$;

-- 3) items.unit + pos_menu_ingredients.option_id / loss_rate
DO $$
BEGIN
  IF to_regclass('public.items') IS NOT NULL THEN
    ALTER TABLE public.items
      ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '';
    COMMENT ON COLUMN public.items.unit IS
      '표준 단위(kg, g, 팩, 개 등). BOM quantity 기준';
  ELSE
    RAISE NOTICE 'skip §3a: public.items not found';
  END IF;

  IF to_regclass('public.pos_menu_ingredients') IS NOT NULL THEN
    ALTER TABLE public.pos_menu_ingredients
      ADD COLUMN IF NOT EXISTS loss_rate NUMERIC(5, 2) DEFAULT 0;

    -- FK는 pos_menu_options 있을 때만 (없으면 컬럼만)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pos_menu_ingredients'
        AND column_name = 'option_id'
    ) THEN
      IF to_regclass('public.pos_menu_options') IS NOT NULL THEN
        ALTER TABLE public.pos_menu_ingredients
          ADD COLUMN option_id BIGINT
            REFERENCES public.pos_menu_options(id) ON DELETE CASCADE DEFAULT NULL;
      ELSE
        ALTER TABLE public.pos_menu_ingredients
          ADD COLUMN option_id BIGINT DEFAULT NULL;
      END IF;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_pos_menu_ingredients_option
      ON public.pos_menu_ingredients(option_id);

    COMMENT ON COLUMN public.pos_menu_ingredients.option_id IS
      'NULL/0=메뉴 기본 BOM, 값=해당 옵션 BOM';
  ELSE
    RAISE NOTICE 'skip §3b: public.pos_menu_ingredients not found';
  END IF;
END $$;

-- 4) erp_stores — 회원앱 매장 카드(사진·지도·주소)
DO $$
BEGIN
  IF to_regclass('public.erp_stores') IS NULL THEN
    RAISE NOTICE 'skip §4: public.erp_stores not found';
    RETURN;
  END IF;

  ALTER TABLE public.erp_stores
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS map_query TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT;

  COMMENT ON COLUMN public.erp_stores.photo_url IS '회원앱 매장 탭 카드 사진 URL';
  COMMENT ON COLUMN public.erp_stores.map_query IS 'Google Maps 검색어 (비우면 display_name 기준 자동)';
  COMMENT ON COLUMN public.erp_stores.address IS '회원앱에 표시할 주소/위치 설명';
END $$;

-- 확인
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_logs' AND column_name = 'is_deleted'
  ) AS stock_logs_has_is_deleted,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_menus' AND column_name = 'delivery_app_fee_percent'
  ) AS pos_menus_has_delivery_app_fee_percent,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_menu_ingredients' AND column_name = 'option_id'
  ) AS pos_menu_ingredients_has_option_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'unit'
  ) AS items_has_unit,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'photo_url'
  ) AS erp_stores_has_photo_url;
