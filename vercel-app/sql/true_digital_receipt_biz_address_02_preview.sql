-- 1/2 미리보기 — True Digital 주소 인쇄 ON 대상
-- 이것만 복사 → Run. UPDATE 없음.

SELECT
  store_code,
  receipt_biz_address,
  receipt_show_biz_address
FROM pos_printer_settings
WHERE store_code = 'CM True Digital';
