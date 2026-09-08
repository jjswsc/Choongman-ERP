-- 1/3 미리보기 — CM MBK / True Digital Park KBank QR 설정
-- 이것만 복사 → Run. UPDATE 없음.

SELECT
  store_code,
  kbank_skip_api_for_qr,
  kbank_merchant_id,
  kbank_partner_shop_id,
  kbank_terminal_id,
  pos_qr_display_mode
FROM pos_printer_settings
WHERE store_code IN ('CM MBK', 'CM True Digital', '1040', '1041')
   OR store_code ILIKE '%MBK%'
   OR store_code ILIKE '%True Digital%'
ORDER BY store_code;
