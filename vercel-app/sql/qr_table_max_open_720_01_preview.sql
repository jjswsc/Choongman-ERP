-- Preview only: current max_open_minutes before raising all stores to 720

SELECT
  store_code,
  enabled,
  require_staff_open,
  max_open_minutes,
  updated_at
FROM public.pos_qr_order_store_settings
ORDER BY store_code;
