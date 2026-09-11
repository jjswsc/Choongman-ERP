-- 3/3 검증 — True Digital MID=190 Shop=00011, MBK MID=191 Shop=00002
-- 이것만 복사 → Run.

SELECT
  store_code,
  kbank_skip_api_for_qr,
  kbank_merchant_id,
  kbank_partner_shop_id,
  pos_qr_display_mode
FROM pos_printer_settings
WHERE store_code IN ('CM True Digital', '1040', 'CM MBK', '1041')
   OR store_code ILIKE '%True Digital%'
   OR store_code ILIKE '%MBK%'
ORDER BY store_code;
