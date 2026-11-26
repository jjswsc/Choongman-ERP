-- pos_menu_options: 옵션별 사진 URL (POS/QR 옵션 피커 썸네일)
-- Grab modifier 는 공식 API 에 photos 가 없어 메뉴 본체 사진만 동기화됨.
-- pos_orders Realtime 미관련 → 영업 중 실행 가능

ALTER TABLE IF EXISTS public.pos_menu_options
  ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.pos_menu_options.image IS
  '옵션 선택 화면용 사진 URL (pos-menu-images Storage 등). 비우면 텍스트만 표시';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_menu_options_image_01_column.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
