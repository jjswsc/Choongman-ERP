-- 캠페인 허브: 캠페인 유형 컬럼 추가
-- Run in Supabase SQL Editor

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'menu_discount';

COMMENT ON COLUMN public.marketing_campaigns.campaign_type IS
  '캠페인 유형 (menu_discount | brand_promo | new_store | seasonal | other)';

