-- 손님 QR 카테고리 홈: 대분류별 원형 이미지 URL (매장별 jsonb)
-- 컬럼 추가만 — pos_orders UPDATE 없음. 영업 중 실행 가능.

ALTER TABLE IF EXISTS public.pos_qr_order_store_settings
  ADD COLUMN IF NOT EXISTS guest_home_category_image_urls jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.pos_qr_order_store_settings.guest_home_category_image_urls IS
  '손님 QR 홈 대분류 원형 이미지. {"Chicken":"https://..."} 형태. 비어 있으면 메뉴 사진 폴백.';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_qr_guest_home_category_images_01_ddl.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
