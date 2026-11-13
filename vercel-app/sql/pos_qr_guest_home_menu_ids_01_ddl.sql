-- 손님 QR 카테고리 홈: 대표메뉴·신메뉴 목록 (배너 클릭 시 손님 선택)
-- 컬럼 추가만 — pos_orders UPDATE 없음. 영업 중 실행 가능.

ALTER TABLE IF EXISTS public.pos_qr_order_store_settings
  ADD COLUMN IF NOT EXISTS guest_home_featured_menu_ids bigint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS guest_home_new_menu_ids bigint[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.pos_qr_order_store_settings.guest_home_featured_menu_ids IS
  '손님 QR 홈 대표메뉴 배너 클릭 시 보여줄 pos_menus.id 목록';

COMMENT ON COLUMN public.pos_qr_order_store_settings.guest_home_new_menu_ids IS
  '손님 QR 홈 신메뉴 배너 클릭 시 보여줄 pos_menus.id 목록';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_qr_guest_home_menu_ids_01_ddl.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
