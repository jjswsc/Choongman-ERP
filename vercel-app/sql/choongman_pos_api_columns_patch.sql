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
