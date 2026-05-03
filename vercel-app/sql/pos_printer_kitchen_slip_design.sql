-- 주방 주문서 슬립 디자인·인쇄 언어 (관리자 디자인 탭 / `kitchen_slip_print_lang` 은 POS 화면 언어 오버라이드)
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_font_scale TEXT DEFAULT 'md';
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_show_line_notes BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_show_order_memo BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_print_lang TEXT;

COMMENT ON COLUMN pos_printer_settings.kitchen_slip_font_scale IS 'sm | md | lg';
COMMENT ON COLUMN pos_printer_settings.kitchen_slip_show_line_notes IS '주방 슬립 품목 줄 메모 표시';
COMMENT ON COLUMN pos_printer_settings.kitchen_slip_show_order_memo IS '주방 슬립 주문 메모 박스 표시';
