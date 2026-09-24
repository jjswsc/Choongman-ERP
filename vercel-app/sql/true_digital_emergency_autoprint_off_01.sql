-- True Digital 긴급: 영수증(หน้าร้าน/결제) 자동인쇄 OFF — 폭주 중단용
-- 실행 후 매장 POS 하드 리프레시(Ctrl+Shift+R)
UPDATE public.pos_printer_settings
SET
  auto_print_receipt_on_payment = false,
  auto_print_receipt_on_order = false,
  auto_print_receipt_on_add_order = false,
  updated_at = now()
WHERE store_code ILIKE '%True Digital%'
   OR store_code ILIKE '%TRUEDIGITA%'
RETURNING store_code,
  auto_print_receipt_on_payment,
  auto_print_receipt_on_order,
  auto_print_receipt_on_add_order;

