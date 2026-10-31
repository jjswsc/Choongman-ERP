-- Apply: CM Union Mall QR session max_open_minutes 240 → 720 (12 hours)
-- Preview first: qr_table_union_mall_max_open_01_preview.sql

UPDATE public.pos_qr_order_store_settings
SET
  max_open_minutes = 720,
  updated_at = now()
WHERE lower(trim(store_code)) IN (
  'cm union mall',
  '1047',
  'union mall'
)
RETURNING store_code, max_open_minutes, require_staff_open, updated_at;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('qr_table_union_mall_max_open_03_set_720.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
