-- 인플루언서 명부 6: 업로드 기록에 지급 상태·지급일·시트 행 키 추가
-- 01~05 실행 후 Run. marketing_influencers 는 POS Realtime 대상이 아니며, 컬럼 추가(DDL)만 하므로 영업 중 실행 가능

ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS paid_at date;

ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS external_ref text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_marketing_influencers_external_ref
  ON public.marketing_influencers (external_ref)
  WHERE external_ref <> '';

COMMENT ON COLUMN public.marketing_influencers.payment_status IS '지급 상태: unpaid(미지급) / billed(청구됨) / paid(지급완료), 빈 값 = 미입력';
COMMENT ON COLUMN public.marketing_influencers.paid_at IS '지급일';
COMMENT ON COLUMN public.marketing_influencers.external_ref IS '시트 가져오기 행 키(sheet:ct:<Job No> / sheet:hired:<handle>) — 재가져오기 시 중복 방지';
