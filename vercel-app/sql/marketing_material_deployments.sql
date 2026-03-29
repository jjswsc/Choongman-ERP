-- 홍보물 매장별 배치/철수 이력
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.marketing_material_deployments (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES public.marketing_materials(id) ON DELETE CASCADE,
  campaign_id BIGINT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  placement_spot TEXT NOT NULL DEFAULT 'counter',
  material_type TEXT NULL,
  installed_on DATE NOT NULL,
  removed_on DATE NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_material_deployments_date_ck
    CHECK (removed_on IS NULL OR removed_on >= installed_on)
);

CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_material_id
  ON public.marketing_material_deployments(material_id);

CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_campaign_id
  ON public.marketing_material_deployments(campaign_id);

CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_store_spot
  ON public.marketing_material_deployments(store_name, placement_spot);

CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_active
  ON public.marketing_material_deployments(installed_on, removed_on);

ALTER TABLE public.marketing_material_deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all marketing_material_deployments" ON public.marketing_material_deployments;
CREATE POLICY "Allow all marketing_material_deployments"
  ON public.marketing_material_deployments
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_material_deployments TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_material_deployments_id_seq TO anon, authenticated;
