-- 협업 관리 전용 세부 입력 (캠페인 기본 필드와 별도 JSON)
-- marketing_campaigns_collab_management.sql 이후 실행 권장

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS collab_detail JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.marketing_campaigns.collab_detail IS
  '협업 관리 화면 전용 세부 정보(제휴·증빙·할인 범위·운영 메모 등). 앱이 직렬화한 객체.';
