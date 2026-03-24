-- 캠페인 허브: 고유번호 컬럼 추가
-- Run in Supabase SQL Editor

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS campaign_no TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_marketing_campaigns_campaign_no
  ON public.marketing_campaigns(campaign_no)
  WHERE campaign_no IS NOT NULL AND campaign_no <> '';

COMMENT ON COLUMN public.marketing_campaigns.campaign_no IS
  '캠페인 고유번호 (예: MC-20260324-1234)';

