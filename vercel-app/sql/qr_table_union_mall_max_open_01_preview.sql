-- Preview only: Union Mall QR table-order session max minutes + recent expired sessions
-- (Does not change data.)

SELECT
  store_code,
  enabled,
  require_staff_open,
  max_open_minutes,
  entry_payment_mode,
  extras_payment_mode,
  guest_bill_pay_enabled,
  updated_at
FROM public.pos_qr_order_store_settings
WHERE lower(trim(store_code)) IN (
  'cm union mall',
  '1047',
  'union mall'
);
