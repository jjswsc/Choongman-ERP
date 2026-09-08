-- 2/3 반영 — CM MBK / True Digital Park KBank QR 개통
-- pos_printer_settings만 수정. pos_orders 아님. POS Realtime 인쇄와 무관.
-- 이것만 복사 → Run.

BEGIN;

UPDATE pos_printer_settings
SET
  kbank_skip_api_for_qr = false,
  kbank_merchant_id = 'KB000002350191',
  kbank_partner_shop_id = 'SJGLB00002'
WHERE store_code IN ('CM MBK', '1041')
   OR store_code ILIKE '%MBK%';

UPDATE pos_printer_settings
SET
  kbank_skip_api_for_qr = false,
  kbank_merchant_id = 'KB000002350191',
  kbank_partner_shop_id = 'SJGLB00002',
  pos_qr_display_mode = 'edc_mirror'
WHERE store_code IN ('CM True Digital', '1040')
   OR store_code ILIKE '%True Digital%';

COMMIT;
