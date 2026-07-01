-- 홍보물 설치 확인 사진 URL
-- Run in Supabase SQL Editor (after marketing_material_store_checks.sql)

ALTER TABLE public.marketing_material_store_checks
  ADD COLUMN IF NOT EXISTS installed_photo_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.marketing_material_store_checks.installed_photo_url IS
  '설치 확인 시 업로드한 현장 사진 (Supabase Storage public URL)';
