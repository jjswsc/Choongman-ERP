-- 캠페인 허브: 기타 비용 입력용 컬럼 추가
-- Run in Supabase SQL Editor

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS cost_other NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS cost_other_label TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.marketing_campaigns.cost_other IS
  '기타 비용 금액';

COMMENT ON COLUMN public.marketing_campaigns.cost_other_label IS
  '기타 비용 항목명';

