-- 1/1 조회 — True Digital 영수증 사업장 주소·표시 on/off
-- 이것만 복사 → Run. UPDATE 없음.
-- 주소가 비었거나 receipt_show_biz_address=false 이면 Tax Invoice 상단에 ที่อยู่ร้าน 이 안 나옵니다.

SELECT
  store_code,
  receipt_biz_name,
  receipt_biz_tax_id,
  receipt_biz_phone,
  receipt_biz_address,
  receipt_show_biz_address,
  updated_at
FROM pos_printer_settings
WHERE store_code IN ('CM True Digital', '1040')
   OR store_code ILIKE '%True Digital%'
ORDER BY store_code;
