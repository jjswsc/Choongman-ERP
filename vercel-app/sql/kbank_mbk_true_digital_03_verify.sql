-- 3/3 검증 — skip=false, MID/Shop ID, True Digital 은 edc_mirror
-- 이것만 복사 → Run.

SELECT
  store_code,
  kbank_skip_api_for_qr,
  kbank_merchant_id,
  kbank_partner_shop_id,
  pos_qr_display_mode
FROM pos_printer_settings
WHERE store_code IN ('CM MBK', 'CM True Digital', '1040', '1041')
   OR store_code ILIKE '%MBK%'
   OR store_code ILIKE '%True Digital%'
ORDER BY store_code;
