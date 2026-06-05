-- pos_coupons에 marketing_campaign_id 추가
-- 증상: PGRST204 — Could not find the 'marketing_campaign_id' column of 'pos_coupons' in the schema cache
-- 사용법: Supabase SQL Editor에서 실행

ALTER TABLE public.pos_coupons
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_coupons_campaign
  ON public.pos_coupons(marketing_campaign_id);

COMMENT ON COLUMN public.pos_coupons.marketing_campaign_id IS '연계 마케팅 캠페인';
