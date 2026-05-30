-- ============================================================
-- pos_settlements_bootstrap.sql
-- POS 일별 결산 테이블 + RLS + upsert 인덱스
-- Supabase SQL Editor에서 이 파일만 실행 (재실행 가능)
--
-- 컬럼 누락(PGRST204 cash_amt 등): pos_settlements_align_app_columns.sql 추가 실행
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_pos_settlements_store ON public.pos_settlements(store_code);
CREATE INDEX IF NOT EXISTS idx_pos_settlements_date ON public.pos_settlements(settle_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_settlements_store_date
  ON public.pos_settlements (store_code, settle_date);

ALTER TABLE public.pos_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for pos_settlements" ON public.pos_settlements;
DROP POLICY IF EXISTS "Allow all for anon" ON public.pos_settlements;
CREATE POLICY "Allow all for pos_settlements"
  ON public.pos_settlements
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pos_orders_store_created_at
  ON public.pos_orders (store_code, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_orders_status_store_created_at
  ON public.pos_orders (status, store_code, created_at);
