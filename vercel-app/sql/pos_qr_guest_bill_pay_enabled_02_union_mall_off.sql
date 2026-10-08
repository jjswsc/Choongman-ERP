-- 유니온몰: 손님 테이블 QR 결제 일시 OFF + 선결제도 후불로

UPDATE public.pos_qr_order_store_settings
SET
  guest_bill_pay_enabled = false,
  entry_payment_mode = 'postpay',
  extras_payment_mode = 'postpay',
  updated_at = now()
WHERE lower(trim(store_code)) IN (
  'cm union mall',
  '1047',
  'union mall'
)
RETURNING store_code, guest_bill_pay_enabled, entry_payment_mode, extras_payment_mode;
