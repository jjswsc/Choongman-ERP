-- Apply: all stores max_open_minutes → 720 (12 hours)
-- Preview first: qr_table_max_open_720_01_preview.sql
-- Verify after: qr_table_max_open_720_03_verify.sql

ALTER TABLE public.pos_qr_order_store_settings
  ALTER COLUMN max_open_minutes SET DEFAULT 720;

UPDATE public.pos_qr_order_store_settings
SET
  max_open_minutes = 720,
  updated_at = now()
WHERE max_open_minutes IS DISTINCT FROM 720
RETURNING store_code, max_open_minutes, enabled, require_staff_open, updated_at;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('qr_table_max_open_720_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
