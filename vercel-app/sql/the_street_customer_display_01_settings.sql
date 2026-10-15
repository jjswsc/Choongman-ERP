-- 1/2 조회 — The Street 손님 화면·KBank QR 현재 설정
-- 이것만 복사 → Run. UPDATE 없음.
-- 정상: dual_monitor_enabled=true, customer_display_auto_open=true,
--       kbank_skip_api_for_qr=false, pos_qr_display_mode='cashier',
--       kbank_merchant_id='KB000002350209', kbank_partner_shop_id='SJGLB00012'

SELECT
  store_code,
  dual_monitor_enabled,
  customer_display_auto_open,
  customer_display_monitor_preference,
  kbank_skip_api_for_qr,
  pos_qr_display_mode,
  kbank_merchant_id,
  kbank_partner_shop_id,
  receipt_biz_name,
  vat_rate,
  updated_at
FROM pos_printer_settings
WHERE store_code IN ('CM The Street', 'CM The street', 'CM The Street Ratchada', '1050')
   OR store_code ILIKE '%The Street%'
ORDER BY store_code;
