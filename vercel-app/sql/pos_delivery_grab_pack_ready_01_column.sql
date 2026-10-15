-- Grab: POS 「포장 완료(แพ็คเสร็จ)」 시 Grab mark-ready 자동 전송 여부 (매장별, 기본 true = 기존 동작 유지)
-- pos_orders 는 건드리지 않음 (Realtime·자동인쇄 영향 없음)

ALTER TABLE IF EXISTS public.pos_delivery_app_policies
  ADD COLUMN IF NOT EXISTS pack_complete_marks_grab_ready boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pos_delivery_app_policies.pack_complete_marks_grab_ready IS
  'Grab 전용. true: 포장 완료 시 Grab에 준비완료 자동 전송. false: 배달 주문 화면의 「Grab에 준비완료 알림」 버튼으로만 전송.';

DO $$ BEGIN
 IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
 INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_delivery_grab_pack_ready_01_column.sql')
 ON CONFLICT (file_name) DO UPDATE
 SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
 END IF;
END $$;
