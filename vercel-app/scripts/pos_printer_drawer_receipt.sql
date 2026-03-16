-- POS 프린터 설정 확장: 돈통관리 + 영수증 출력 옵션
-- 실행: Supabase SQL Editor에서 실행

-- 돈통관리
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS card_auto_open BOOLEAN DEFAULT false;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS check_auto_open BOOLEAN DEFAULT false;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS drawer_open_option TEXT DEFAULT 'reason_only';

-- 영수증 출력 옵션
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS logo_print BOOLEAN DEFAULT false;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS receipt_print_timing TEXT DEFAULT 'per_payment';
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS customer_receipt_order_details BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS merchant_receipt_order_details BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS cash_payment_receipt BOOLEAN DEFAULT false;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS signature_line BOOLEAN DEFAULT false;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS receipt_barcode BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS item_barcode BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS qr_code_option TEXT DEFAULT 'yes';
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS discount_separate_print BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS merchant_receipt_print BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS actual_order_details BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS topping_options_print BOOLEAN DEFAULT false;
