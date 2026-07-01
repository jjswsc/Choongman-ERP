-- 홍보물 매장별 수령·설치 확인 (2단계 체크리스트)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.marketing_material_store_checks (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES public.marketing_materials(id) ON DELETE CASCADE,
  campaign_id BIGINT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  received_on DATE NULL,
  received_by TEXT NOT NULL DEFAULT '',
  installed_on DATE NULL,
  installed_by TEXT NOT NULL DEFAULT '',
  installed_placement_spot TEXT NULL,
  installed_photo_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_material_store_checks_unique
    UNIQUE (material_id, store_name),
  CONSTRAINT marketing_material_store_checks_placement_ck
    CHECK (
      installed_placement_spot IS NULL
      OR installed_placement_spot IN ('counter', 'tv', 'table', 'entrance')
    )
);

CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_material
  ON public.marketing_material_store_checks(material_id);

CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_campaign
  ON public.marketing_material_store_checks(campaign_id);

CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_store
  ON public.marketing_material_store_checks(store_name);

ALTER TABLE public.marketing_material_store_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all marketing_material_store_checks" ON public.marketing_material_store_checks;
CREATE POLICY "Allow all marketing_material_store_checks"
  ON public.marketing_material_store_checks
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_material_store_checks TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_material_store_checks_id_seq TO anon, authenticated;
