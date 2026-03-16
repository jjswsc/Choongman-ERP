-- 주문 완료 시 자동 인쇄 옵션
ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS auto_print_receipt_on_order BOOLEAN DEFAULT false;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS auto_print_receipt_on_add_order BOOLEAN DEFAULT false;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS auto_print_receipt_on_payment BOOLEAN DEFAULT false;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS auto_print_kitchen_slip_on_order BOOLEAN DEFAULT false;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_biz_name TEXT DEFAULT '';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_biz_tax_id TEXT DEFAULT '';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_biz_owner TEXT DEFAULT '';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_biz_address TEXT DEFAULT '';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_biz_phone TEXT DEFAULT '';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_design_style TEXT DEFAULT 'badge';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_logo_size TEXT DEFAULT 'md';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_title BOOLEAN DEFAULT true;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_paid_stamp BOOLEAN DEFAULT true;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_thank_you BOOLEAN DEFAULT true;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_customer_copy BOOLEAN DEFAULT true;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 7;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS vat_mode TEXT DEFAULT 'included';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS service_rate NUMERIC DEFAULT 0;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS service_mode TEXT DEFAULT 'separate';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS card_rate NUMERIC DEFAULT 0;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS card_mode TEXT DEFAULT 'separate';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS card_base_mode TEXT DEFAULT 'card_only';

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS other_rate NUMERIC DEFAULT 0;

ALTER TABLE pos_printer_settings
  ADD COLUMN IF NOT EXISTS other_mode TEXT DEFAULT 'separate';
