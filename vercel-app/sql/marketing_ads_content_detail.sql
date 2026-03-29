-- 광고 ROAS: Content Topic 외 상세 메모(선택)
ALTER TABLE IF EXISTS public.marketing_ads
  ADD COLUMN IF NOT EXISTS content_detail text;

COMMENT ON COLUMN public.marketing_ads.content_detail IS '콘텐츠 주제 외 상세 설명·메모(선택)';
