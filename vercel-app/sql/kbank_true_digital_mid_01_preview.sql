-- 1/3 미리보기 — True Digital Park KBank MID (MBK 191과 구분)
-- 이것만 복사 → Run. UPDATE 없음.

SELECT
  store_code,
  kbank_skip_api_for_qr,
  kbank_merchant_id,
  kbank_partner_shop_id,
  kbank_terminal_id,
  pos_qr_display_mode
FROM pos_printer_settings
WHERE store_code IN ('CM True Digital', '1040', 'CM MBK', '1041')
   OR store_code ILIKE '%True Digital%'
   OR store_code ILIKE '%MBK%'
ORDER BY store_code;
