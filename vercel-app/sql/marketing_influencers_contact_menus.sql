-- 인플루언서: 연락용 실명/전화, 제공 메뉴(POS 스냅샷)
-- Supabase SQL Editor에서 실행 후 스키마 리로드

ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provided_menus jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.marketing_influencers.name IS 'SNS 계정·필명 등 표시용 ID(기존 호환)';
COMMENT ON COLUMN public.marketing_influencers.contact_name IS '실명 등 연락·풀 집계용 이름';
COMMENT ON COLUMN public.marketing_influencers.contact_phone IS '연락처';
COMMENT ON COLUMN public.marketing_influencers.provided_menus IS '제공 메뉴 스냅샷 JSON [{id,code,name,price,quantity,categoryMain}]';
COMMENT ON COLUMN public.marketing_influencers.branch_review IS '협업 매장(매장 목록에서 선택한 명칭)';
