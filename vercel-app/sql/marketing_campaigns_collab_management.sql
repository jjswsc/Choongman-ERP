-- 협업 관리 화면에 노출할 캠페인 표시 여부
-- Supabase SQL Editor에서 실행

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS collab_management BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.marketing_campaigns.collab_management IS
  'true면 마케팅 > 협업 관리 목록에 포함. 캠페인 편집에서 설정.';

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_collab_management
  ON public.marketing_campaigns (collab_management)
  WHERE collab_management = true;
