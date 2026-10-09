-- 매장별 손님 QR 숨김 메뉴 (예: 무료 김치)
-- 손님 QR 메뉴·장바구니 제출에서만 제외. POS 직원 화면·다른 매장은 영향 없음.
-- 컬럼 추가만 (pos_orders UPDATE 없음 — 영업 중 실행 가능)

ALTER TABLE IF EXISTS public.pos_qr_order_store_settings
  ADD COLUMN IF NOT EXISTS hidden_menu_ids bigint[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.pos_qr_order_store_settings.hidden_menu_ids IS
  '이 매장 손님 QR에서 숨길 pos_menus.id 목록. 관리자 > QR 테이블오더 > QR에서 숨길 메뉴.';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_qr_hidden_menu_ids_01_ddl.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
