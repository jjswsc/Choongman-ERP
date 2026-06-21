-- ============================================================
-- choongman_pos_api_columns_patch.sql
-- 충만(레거시) Supabase — 오늘 API 변경 호환 (한 번 붙여넣기)
--
-- 대상: faxolqgaadcvyeyvrydc (충만 ERP)
-- ⚠️ Omni(SaaS) DB에는 omni_pos_choongman_parity.sql 사용
--
-- 해결:
--   · pos_orders.discount_reason — Grab/Shopee 주문 POST PGRST204
--   · pos_grab_store_integrations — (선택) Grab 연동 상태 테이블 404
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
