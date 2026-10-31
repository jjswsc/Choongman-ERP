-- Verify: Union Mall max_open_minutes should be 720

SELECT
  store_code,
  enabled,
  require_staff_open,
  max_open_minutes,
  updated_at
FROM public.pos_qr_order_store_settings
WHERE lower(trim(store_code)) IN (
  'cm union mall',
  '1047',
  'union mall'
);
