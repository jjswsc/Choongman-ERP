-- 마케팅 캠페인 테이블 전체 마이그레이션
-- Supabase SQL Editor에서 실행

-- 1. 캠페인 유형 (campaign_type)
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'menu_discount';
COMMENT ON COLUMN public.marketing_campaigns.campaign_type IS
  '캠페인 유형 (menu_discount | brand_promo | new_store | seasonal | other)';

-- 2. 캠페인 고유번호 (campaign_no)
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS campaign_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketing_campaigns_campaign_no
  ON public.marketing_campaigns(campaign_no)
  WHERE campaign_no IS NOT NULL AND campaign_no <> '';
COMMENT ON COLUMN public.marketing_campaigns.campaign_no IS
  '캠페인 고유번호 (6자리 숫자)';

-- 3. 기타 비용 (cost_other, cost_other_label)
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS cost_other NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS cost_other_label TEXT NOT NULL DEFAULT '';
COMMENT ON COLUMN public.marketing_campaigns.cost_other IS '기타 비용 금액';
COMMENT ON COLUMN public.marketing_campaigns.cost_other_label IS '기타 비용 항목명';
