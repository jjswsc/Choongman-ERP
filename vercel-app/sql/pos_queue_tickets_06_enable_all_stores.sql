-- 자리 대기 번호표 — 전 매장 사용 (system_settings 1키, pos_orders 미변경 · 영업 중 실행 가능)
-- 앱은 매장 코드가 있으면 이미 켠다. 이 파일은 시범 설정(pos_queue_all_stores=false, 유니온몰만)을 전 매장 켜짐과 맞춘다.
-- 번호는 매장·영업일(YYYYMMDD)마다 1부터라 매장끼리 섞이지 않는다 (pos_queue_counters PK).
-- LINE 호출(pos_queue_line_notify_enabled)과 기존 유니온몰 발급 번호는 바꾸지 않는다.
-- 충만·Omni Supabase 각각 1회 실행.
INSERT INTO public.system_settings (key, value_json, updated_at)
VALUES
  ('pos_queue_all_stores', 'true'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok'))
ON CONFLICT (key) DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = EXCLUDED.updated_at;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_queue_tickets_06_enable_all_stores.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
