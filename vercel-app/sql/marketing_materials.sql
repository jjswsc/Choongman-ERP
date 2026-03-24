-- 캠페인별 판촉물(오프라인 홍보물) 관리
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.marketing_materials (
  id         BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'tentcard',  -- tentcard | standee | coupon | flyer | banner | prop | other
  name       TEXT NOT NULL DEFAULT '',
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_cost  NUMERIC(12,2) NOT NULL DEFAULT 0,
  branches   JSONB NOT NULL DEFAULT '[]',        -- 배포 지점 목록
  status     TEXT NOT NULL DEFAULT 'planning',  -- planning | producing | completed | distributed
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_materials_campaign_id
  ON public.marketing_materials(campaign_id);

ALTER TABLE public.marketing_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_materials" ON public.marketing_materials;
CREATE POLICY "Allow all marketing_materials"
  ON public.marketing_materials
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_materials TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_materials_id_seq TO anon, authenticated;
