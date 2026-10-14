-- 자리 대기 번호표 — Union Mall만 시범 켜기 (system_settings 3키, pos_orders 미변경 · 영업 중 실행 가능)
-- 다른 매장 추가: pos_queue_store_codes 배열에 매장 코드를 넣고 다시 실행
-- 전 매장 켜기: pos_queue_all_stores = true
-- LINE 호출 끄기: pos_queue_line_notify_enabled = false
INSERT INTO public.system_settings (key, value_json, updated_at)
VALUES
  ('pos_queue_store_codes', '["CM Union Mall"]'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('pos_queue_all_stores', 'false'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('pos_queue_line_notify_enabled', 'true'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok'))
ON CONFLICT (key) DO UPDATE
SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_queue_tickets_02_enable_union_mall.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
