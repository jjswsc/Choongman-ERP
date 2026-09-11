-- 2/3 반영 — True Digital Park 를 MBK 계좌(MID 191 / Shop 00002)에서 분리
-- pos_printer_settings만 수정. pos_orders 아님. POS Realtime 인쇄와 무관.
-- True Digital: KB000002350190 / SJGLB00011
-- MBK:          KB000002350191 / SJGLB00002  (이 문에서는 변경하지 않음)
-- 이것만 복사 → Run.

BEGIN;

UPDATE pos_printer_settings
SET
  kbank_skip_api_for_qr = false,
  kbank_merchant_id = 'KB000002350190',
  kbank_partner_shop_id = 'SJGLB00011'
WHERE store_code IN ('CM True Digital', '1040')
   OR store_code ILIKE '%True Digital%';

COMMIT;
