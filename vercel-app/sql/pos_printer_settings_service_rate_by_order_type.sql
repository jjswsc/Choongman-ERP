-- 서비스비 %를 홀 / 포장 / 배달별로 저장
-- service_rate = 홀(매장). 포장·배달 컬럼이 NULL이면 앱이 service_rate 로 폴백(기존과 동일).
-- 영업 중 실행 가능. pos_orders UPDATE 없음 → Realtime 영수증 재인쇄와 무관.

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS service_rate_takeout numeric,
  ADD COLUMN IF NOT EXISTS service_rate_delivery numeric;

COMMENT ON COLUMN public.pos_printer_settings.service_rate IS
  '홀(매장) 서비스비 %. 포장·배달 미설정 시 폴백.';
COMMENT ON COLUMN public.pos_printer_settings.service_rate_takeout IS
  '포장 서비스비 %. NULL=홀(service_rate)과 동일, 0=포장 미적용.';
COMMENT ON COLUMN public.pos_printer_settings.service_rate_delivery IS
  '배달 서비스비 %. NULL=홀(service_rate)과 동일, 0=배달 미적용.';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_printer_settings_service_rate_by_order_type.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
