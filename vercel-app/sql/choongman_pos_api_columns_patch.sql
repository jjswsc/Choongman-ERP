-- ============================================================
-- choongman_pos_api_columns_patch.sql
-- 충만(레거시) Supabase — API·RPC 호환 (한 번 붙여넣기)
--
-- 대상: faxolqgaadcvyeyvrydc (충만 ERP)
-- ⚠️ Omni(SaaS) DB에는 omni_pos_choongman_parity.sql 사용
--
-- 이 파일만으로 부족하면 아래도 SQL Editor에서 각 1회 실행:
--   · get_login_data_employees_rpc.sql
--   · get_pos_sales_period_summary_deploy.sql
--   · get_pos_sales_analytics_agg.sql  (guest_sum bigint 캐스트 — 매출 RPC 42804)
--   · enqueue_pos_print_job_deploy.sql (주방 인쇄 dedupe 23505 로그)
-- ============================================================

ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT '';

-- POS 메뉴판 (getPosMenuBoards PGRST205)
CREATE TABLE IF NOT EXISTS public.pos_menu_boards (
  id bigserial PRIMARY KEY,
  store_code text NOT NULL,
  board_type text NOT NULL,
  board_name text NOT NULL,
  group_grid_cols integer NOT NULL DEFAULT 5,
  group_grid_rows integer NOT NULL DEFAULT 2,
  menu_grid_cols integer NOT NULL DEFAULT 5,
  menu_grid_rows integer NOT NULL DEFAULT 5,
  resolution_width integer NOT NULL DEFAULT 1024,
  resolution_height integer NOT NULL DEFAULT 768,
  group_count integer NOT NULL DEFAULT 0,
  menu_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_menu_boards_unique_name
  ON public.pos_menu_boards (store_code, board_type, board_name);
ALTER TABLE public.pos_menu_boards ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_menu_boards TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pos_menu_boards_id_seq TO anon, authenticated;
DROP POLICY IF EXISTS "pos_menu_boards_allow_public" ON public.pos_menu_boards;
CREATE POLICY "pos_menu_boards_allow_public"
  ON public.pos_menu_boards FOR ALL TO public USING (true) WITH CHECK (true);

-- POS 최종가격 (getPosPrinterSettings / loadPosPricingAdjustmentsForStore 42703)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS card_base_mode TEXT DEFAULT 'card_only',
  ADD COLUMN IF NOT EXISTS fee_stack_mode TEXT DEFAULT 'parallel',
  ADD COLUMN IF NOT EXISTS fee_stack_order JSONB DEFAULT '["service","vat","other"]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_total_rounding_mode TEXT DEFAULT 'round',
  ADD COLUMN IF NOT EXISTS round_payment_total_to_whole_baht BOOLEAN DEFAULT true;

-- Grab 연동 상태 스냅샷 (Omni 전용이 아니어도 배포 가능 — GRAB_STORE_MAP_JSON 병행 사용)
CREATE TABLE IF NOT EXISTS public.pos_grab_store_integrations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grab_merchant_id text NOT NULL,
  partner_merchant_id text NOT NULL,
  integration_status text NOT NULL,
  last_request_id text NULL,
  last_message text NULL,
  payload_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_grab_store_integrations_pair
  ON public.pos_grab_store_integrations(grab_merchant_id, partner_merchant_id);

CREATE INDEX IF NOT EXISTS idx_pos_grab_store_integrations_status
  ON public.pos_grab_store_integrations(integration_status);

CREATE INDEX IF NOT EXISTS idx_pos_grab_store_integrations_updated
  ON public.pos_grab_store_integrations(updated_at DESC);
