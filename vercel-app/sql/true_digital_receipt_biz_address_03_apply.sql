-- 2/2 적용 — True Digital 손님 영수증에 사업장 주소 인쇄 ON
-- 이것만 복사 → Run. 미리보기(02) 확인 후 실행.

UPDATE pos_printer_settings
SET
  receipt_show_biz_address = true,
  updated_at = now()
WHERE store_code = 'CM True Digital'
  AND receipt_show_biz_address IS DISTINCT FROM true
RETURNING
  store_code,
  left(receipt_biz_address, 80) AS address_preview,
  receipt_show_biz_address,
  updated_at;
