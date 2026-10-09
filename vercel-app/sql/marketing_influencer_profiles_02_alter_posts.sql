-- 인플루언서 명부 2/4: 업로드 기록(marketing_influencers)에 명부 연결 컬럼 추가
-- 01 실행 후 Run. 캠페인 연결은 선택 사항(campaign_id NULL 허용)

ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS profile_id bigint REFERENCES public.marketing_influencer_profiles(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.marketing_influencers
  ALTER COLUMN campaign_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_influencers_profile_id
  ON public.marketing_influencers (profile_id);

CREATE INDEX IF NOT EXISTS idx_marketing_influencers_publish_date
  ON public.marketing_influencers (publish_date);

COMMENT ON COLUMN public.marketing_influencers.profile_id IS '인플루언서 명부(marketing_influencer_profiles.id)';
COMMENT ON COLUMN public.marketing_influencers.publish_date IS '업로드(게시)일 — 매출 효과 전후 비교 기준일';
