-- 실롬 Grab 파트너 ID(1042)로 남은 예전 정책 행도 자동 전송 끄기 (CM Silom 과 같은 매장)
UPDATE public.pos_delivery_app_policies
SET pack_complete_marks_grab_ready = false,
    updated_at = now()
WHERE app_code = 'grab'
  AND store_code = '1042';

DO $$ BEGIN
 IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
 INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_delivery_grab_pack_ready_04_silom_legacy_key_off.sql')
 ON CONFLICT (file_name) DO UPDATE
 SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
 END IF;
END $$;
