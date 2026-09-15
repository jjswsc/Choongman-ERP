-- 1/3 미리보기 — The Street / Union Mall KBank MID
-- 이것만 복사 → Run. UPDATE 없음.

SELECT
  store_code,
  kbank_skip_api_for_qr,
  kbank_merchant_id,
  kbank_partner_shop_id,
  kbank_terminal_id,
  pos_qr_display_mode
FROM pos_printer_settings
WHERE store_code IN (
    'CM The Street',
    'CM The street',
    'CM The Street Ratchada',
    '1050',
    'CM Union Mall',
    'Union Mall',
    '1047'
  )
   OR store_code ILIKE '%The Street%'
   OR store_code ILIKE '%Union Mall%'
ORDER BY store_code;
