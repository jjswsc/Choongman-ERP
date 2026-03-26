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
  is_hq_wide BOOLEAN NOT NULL DEFAULT FALSE,     -- 본사 공용 홍보물 여부
  display_start_date DATE NULL,                  -- 홍보물 게시 시작일
  display_end_date DATE NULL,                    -- 홍보물 게시 종료일
  placement_spots JSONB NOT NULL DEFAULT '[]',   -- counter | tv | table | entrance
  status     TEXT NOT NULL DEFAULT 'planning',  -- planning | producing | completed | distributed
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS is_hq_wide BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS display_start_date DATE NULL;
ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS display_end_date DATE NULL;
ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS placement_spots JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_marketing_materials_campaign_id
  ON public.marketing_materials(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_materials_is_hq_wide
  ON public.marketing_materials(is_hq_wide);

ALTER TABLE public.marketing_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_materials" ON public.marketing_materials;
CREATE POLICY "Allow all marketing_materials"
  ON public.marketing_materials
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_materials TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_materials_id_seq TO anon, authenticated;
