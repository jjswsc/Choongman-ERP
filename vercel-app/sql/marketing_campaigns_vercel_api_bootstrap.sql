-- =============================================================================
-- marketing_campaigns — Vercel 마케팅 캠페인 API 전용 컬럼 일괄 추가
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- ADD COLUMN IF NOT EXISTS 이므로 반복 실행해도 안전합니다.
--
-- PGRST204 예: "Could not find the 'discount_target_audience' column..."
-- → 아래 ALTER 중 누락된 컬럼이 있으면 모두 추가됩니다.
-- =============================================================================

-- 캠페인 유형
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'menu_discount';
COMMENT ON COLUMN public.marketing_campaigns.campaign_type IS
  '캠페인 유형 (menu_discount | brand_promo | new_store | seasonal | other 등)';

-- 캠페인 고유번호
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS campaign_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketing_campaigns_campaign_no
  ON public.marketing_campaigns (campaign_no)
  WHERE campaign_no IS NOT NULL AND campaign_no <> '';
COMMENT ON COLUMN public.marketing_campaigns.campaign_no IS
  '캠페인 고유번호 (YYMM+랜덤 등)';

-- 기타 비용
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS cost_other NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS cost_other_label TEXT NOT NULL DEFAULT '';
COMMENT ON COLUMN public.marketing_campaigns.cost_other IS '기타 비용 금액';
COMMENT ON COLUMN public.marketing_campaigns.cost_other_label IS '기타 비용 항목명';

-- 할인·협업 대상 (기획 메모) — API save 시 항상 전송
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS discount_target_audience TEXT NOT NULL DEFAULT '';
COMMENT ON COLUMN public.marketing_campaigns.discount_target_audience IS
  '할인·협업 행사 대상 (예: 전체 고객, 앱 회원, 특정 존).';

-- 협업 관리 목록 노출
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS collab_management BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.marketing_campaigns.collab_management IS
  'true면 마케팅 > 협업 관리 목록에 포함';
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_collab_management
  ON public.marketing_campaigns (collab_management)
  WHERE collab_management = true;

-- 협업 세부 JSON (GET 단건·collab API)
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS collab_detail JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.marketing_campaigns.collab_detail IS
  '협업 관리 화면 전용 세부 정보 JSON';

-- 차수별 기간 (1차·2차·3차)
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS phase_periods JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.marketing_campaigns.phase_periods IS
  '차수별 기간: [{ "label", "startDate", "endDate" }, ...]';

-- 디자인 일정 (캠페인 단위)
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS design_start_date DATE;
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS design_end_date DATE;
ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS design_note TEXT NOT NULL DEFAULT '';
COMMENT ON COLUMN public.marketing_campaigns.design_start_date IS
  '디자인 작업 시작일 (캠페인 일정 트랙)';
COMMENT ON COLUMN public.marketing_campaigns.design_end_date IS
  '디자인 작업 종료일 (캠페인 일정 트랙)';
COMMENT ON COLUMN public.marketing_campaigns.design_note IS
  '디자인 작업 메모/링크 요약';
