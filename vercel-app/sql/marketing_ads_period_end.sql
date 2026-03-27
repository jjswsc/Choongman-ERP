-- 광고 ROAS: 집행·노출 종료일 (시작은 기존 publish_date)
ALTER TABLE IF EXISTS public.marketing_ads
  ADD COLUMN IF NOT EXISTS period_end_date date;

COMMENT ON COLUMN public.marketing_ads.publish_date IS '집행·게시 시작일(기간 시작)';
COMMENT ON COLUMN public.marketing_ads.period_end_date IS '집행·노출 종료일(선택, 기간 끝)';
