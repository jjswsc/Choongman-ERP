-- 자리 대기 번호표 — (역사) Union Mall만 시범 켜기. 다시 실행하지 말 것.
-- 전 매장 사용은 pos_queue_tickets_06_enable_all_stores.sql
-- 이 파일은 system_settings 3키를 시범 값으로 되돌린다. pos_orders 는 건드리지 않는다.
-- LINE 호출만 끄려면 pos_queue_line_notify_enabled = false (06 실행 후 그 키만 따로)
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
