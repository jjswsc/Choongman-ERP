-- 손님 QR 카테고리 홈: 대표메뉴·신메뉴 고정 배너 URL (매장별)
-- office 파일럿 UI에서 사용. 컬럼만 추가 — 기존 설정/주문에 영향 없음.

ALTER TABLE IF EXISTS public.pos_qr_order_store_settings
  ADD COLUMN IF NOT EXISTS guest_home_hero_banner_url text,
  ADD COLUMN IF NOT EXISTS guest_home_new_menu_banner_url text;

COMMENT ON COLUMN public.pos_qr_order_store_settings.guest_home_hero_banner_url IS
  '손님 QR 카테고리 홈 상단 대표메뉴 배너 이미지 URL';

COMMENT ON COLUMN public.pos_qr_order_store_settings.guest_home_new_menu_banner_url IS
  '손님 QR 카테고리 홈 신메뉴 안내 칸 이미지 URL';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_qr_guest_home_banners_01_ddl.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
