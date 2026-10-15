-- 실롬만: 포장 완료(แพ็คเสร็จ) 시 Grab 준비완료 자동 전송 끄기
-- 선행: pos_delivery_grab_pack_ready_01_column.sql
-- 실롬 Grab 정책 행이 없으면 기본값(수락 모드 manual 등 = 현재 동작과 동일)으로 새로 만든다.

BEGIN;

UPDATE public.pos_delivery_app_policies
SET pack_complete_marks_grab_ready = false,
    updated_at = now()
WHERE app_code = 'grab'
  AND store_code ILIKE '%silom%';

INSERT INTO public.pos_delivery_app_policies (store_code, app_code, pack_complete_marks_grab_ready)
SELECT 'CM Silom', 'grab', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.pos_delivery_app_policies
  WHERE app_code = 'grab' AND store_code ILIKE '%silom%'
);

DO $$ BEGIN
 IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
 INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_delivery_grab_pack_ready_02_silom_off.sql')
 ON CONFLICT (file_name) DO UPDATE
 SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
 END IF;
END $$;

COMMIT;
