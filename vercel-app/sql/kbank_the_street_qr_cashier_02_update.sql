-- 2/3 반영 — The Street 는 고객 모니터가 있음. EDC 자체 QR(tx70) 금지, 캐셔/손님 화면만.
-- pos_printer_settings만 수정. pos_orders 아님. POS Realtime 인쇄와 무관.
-- 이것만 복사 → Run.

BEGIN;

UPDATE pos_printer_settings
SET pos_qr_display_mode = 'cashier'
WHERE store_code IN ('CM The Street', 'CM The street', 'CM The Street Ratchada', '1050')
   OR store_code ILIKE '%The Street%';

COMMIT;
