-- 주방 주문서 슬립 디자인 (관리자 디자인 탭)
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_font_scale TEXT DEFAULT 'md';
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_show_line_notes BOOLEAN DEFAULT true;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS kitchen_slip_show_order_memo BOOLEAN DEFAULT true;

COMMENT ON COLUMN pos_printer_settings.kitchen_slip_font_scale IS 'sm | md | lg';
COMMENT ON COLUMN pos_printer_settings.kitchen_slip_show_line_notes IS '주방 슬립 품목 줄 메모 표시';
COMMENT ON COLUMN pos_printer_settings.kitchen_slip_show_order_memo IS '주방 슬립 주문 메모 박스 표시';
