-- 주문/영수증/주방 인쇄 언어 설정 (관리자에서 선택, 없으면 화면 언어 사용)
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS receipt_print_lang TEXT;
