-- 회원앱 매장 정보: erp_stores 확장 (위치·사진)
-- Supabase SQL Editor에서 erp_stores.sql 적용 후 실행

ALTER TABLE IF EXISTS public.erp_stores
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS map_query text,
  ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.erp_stores.photo_url IS '회원앱 매장 탭 카드 사진 URL';
COMMENT ON COLUMN public.erp_stores.map_query IS 'Google Maps 검색어 (비우면 display_name 기준 자동)';
COMMENT ON COLUMN public.erp_stores.address IS '회원앱에 표시할 주소/위치 설명';
