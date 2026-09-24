-- True Digital: 영수증 자동인쇄 재활성화 (긴급 OFF 해제)
-- 실행 후 매장 POS 하드 리프레시(Ctrl+Shift+R)
UPDATE public.pos_printer_settings
SET
  auto_print_receipt_on_payment = true,
  auto_print_receipt_on_order = true,
  auto_print_receipt_on_add_order = true,
  updated_at = now()
WHERE store_code ILIKE '%True Digital%'
   OR store_code ILIKE '%TRUEDIGITA%'
RETURNING store_code,
  auto_print_receipt_on_payment,
  auto_print_receipt_on_order,
  auto_print_receipt_on_add_order;
