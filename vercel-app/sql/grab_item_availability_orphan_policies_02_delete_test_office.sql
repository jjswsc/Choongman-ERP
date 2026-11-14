-- 적용: GrabFood 아웃렛이 아닌 TEST·본사(CM Office) Grab 메뉴 정책 삭제
-- 영업 중 POS Realtime과 무관(pos_orders 미변경). 01_preview 확인 후 Run.
-- CM Phuket은 연동 매장이면 맵 등록, 미연동이면 03_delete_phuket.sql 별도 실행.

DELETE FROM public.pos_delivery_menu_policies
WHERE app_code = 'grab'
  AND (
    store_code IN ('TEST', 'CM TEST', 'CM Office', 'Office')
    OR lower(BTRIM(store_code)) IN ('test', 'cm test', 'cmtest', 'office', 'cm office')
  );

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('grab_item_availability_orphan_policies_02_delete_test_office.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
