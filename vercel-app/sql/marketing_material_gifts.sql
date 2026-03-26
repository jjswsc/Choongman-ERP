-- 홍보물별 사은품 배정/배포/잔여 추적
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.marketing_material_gifts (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES public.marketing_materials(id) ON DELETE CASCADE,
  campaign_id BIGINT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  gift_name TEXT NOT NULL DEFAULT '',
  allocated_qty INTEGER NOT NULL DEFAULT 0,
  distributed_qty INTEGER NOT NULL DEFAULT 0,
  remaining_qty INTEGER NOT NULL DEFAULT 0,
  rule_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_material_id
  ON public.marketing_material_gifts(material_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_campaign_id
  ON public.marketing_material_gifts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_store_name
  ON public.marketing_material_gifts(store_name);

ALTER TABLE public.marketing_material_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_material_gifts" ON public.marketing_material_gifts;
CREATE POLICY "Allow all marketing_material_gifts"
  ON public.marketing_material_gifts
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_material_gifts TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_material_gifts_id_seq TO anon, authenticated;
