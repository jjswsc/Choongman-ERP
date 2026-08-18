-- 매장별 Thai QR 표시: cashier | edc_mirror | edc_native
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS pos_qr_display_mode TEXT NOT NULL DEFAULT 'cashier';

COMMENT ON COLUMN public.pos_printer_settings.pos_qr_display_mode IS
  'cashier=캐셔/고객모니터 Thai QR+POS Inquiry. edc_mirror=KBank QR를 EDC에 표시(mirror)+POS 자동 Inquiry(고객모니터 없는 매장 권장). edc_native=LinkPOS tx70(EDC에서 ตรวจสอบรายการ).';
