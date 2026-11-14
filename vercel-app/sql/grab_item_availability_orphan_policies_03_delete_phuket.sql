-- 적용(선택): CM Phuket Grab 메뉴 정책 삭제 — Grab 미연동일 때만
-- 연동할 거면 이 파일 실행하지 말고 GRAB_STORE_MAP_JSON / pos_grab_store_integrations에 Merchant ID 등록.
-- 01_preview에서 CM Phuket 건수 확인 후 Run.

DELETE FROM public.pos_delivery_menu_policies
WHERE app_code = 'grab'
  AND (
    store_code = 'CM Phuket'
    OR lower(BTRIM(store_code)) = 'cm phuket'
  );

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('grab_item_availability_orphan_policies_03_delete_phuket.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
