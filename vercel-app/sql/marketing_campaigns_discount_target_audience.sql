-- 캠페인: 협업 관리(기획) — 할인 대상(누구에게) 기록
-- Supabase SQL Editor에서 실행

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS discount_target_audience TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.marketing_campaigns.discount_target_audience IS
  '할인·협업 행사 대상 (예: 전체 고객, 앱 회원, 특정 그랩존 등). 기획 메모용.';
