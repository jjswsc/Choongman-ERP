-- 2/3 반영 — The Street / Union Mall KBank QR 개통
-- pos_printer_settings만 수정. pos_orders 아님. POS Realtime 인쇄와 무관.
-- The Street:  KB000002350209 / SJGLB00012  (고객 모니터 있음 → cashier 유지)
-- Union Mall:  KB000002350372 / SJGLB00008  (고객 모니터 없음 → edc_mirror, 회원앱 QR)
-- 이것만 복사 → Run.

BEGIN;

UPDATE pos_printer_settings
SET
  kbank_skip_api_for_qr = false,
  kbank_merchant_id = 'KB000002350209',
  kbank_partner_shop_id = 'SJGLB00012'
WHERE store_code IN ('CM The Street', 'CM The street', 'CM The Street Ratchada', '1050')
   OR store_code ILIKE '%The Street%';

UPDATE pos_printer_settings
SET
  kbank_skip_api_for_qr = false,
  kbank_merchant_id = 'KB000002350372',
  kbank_partner_shop_id = 'SJGLB00008',
  pos_qr_display_mode = 'edc_mirror'
WHERE store_code IN ('CM Union Mall', 'Union Mall', '1047')
   OR store_code ILIKE '%Union Mall%';

COMMIT;
