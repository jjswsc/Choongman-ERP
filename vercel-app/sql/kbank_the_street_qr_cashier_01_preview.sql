-- 1/3 미리보기 — The Street Thai QR 표시 모드 (고객 모니터)
-- 이것만 복사 → Run. UPDATE 없음.

SELECT
  store_code,
  kbank_skip_api_for_qr,
  kbank_merchant_id,
  kbank_partner_shop_id,
  pos_qr_display_mode
FROM pos_printer_settings
WHERE store_code IN ('CM The Street', 'CM The street', 'CM The Street Ratchada', '1050')
   OR store_code ILIKE '%The Street%'
ORDER BY store_code;
