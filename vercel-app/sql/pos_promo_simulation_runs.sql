-- 프로모션 세트 시뮬레이션 저장 이력
-- Supabase SQL Editor에서 실행 (멱등)

CREATE TABLE IF NOT EXISTS public.pos_promo_simulation_runs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NULL,
  promo_id BIGINT NULL,
  run_name TEXT NOT NULL DEFAULT '',
  input_payload JSONB NOT NULL DEFAULT '{}',
  output_payload JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_promo_sim_runs_campaign_id
  ON public.pos_promo_simulation_runs (campaign_id);

CREATE INDEX IF NOT EXISTS idx_pos_promo_sim_runs_promo_id
  ON public.pos_promo_simulation_runs (promo_id);

ALTER TABLE public.pos_promo_simulation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_promo_simulation_runs" ON public.pos_promo_simulation_runs;
CREATE POLICY "Allow all pos_promo_simulation_runs"
  ON public.pos_promo_simulation_runs
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_promo_simulation_runs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pos_promo_simulation_runs_id_seq TO anon, authenticated;
