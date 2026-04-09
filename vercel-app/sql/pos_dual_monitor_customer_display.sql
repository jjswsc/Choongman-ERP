-- POS 듀얼 모니터(고객 화면) 설정 컬럼
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS dual_monitor_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_display_auto_open BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_monitor_preference TEXT DEFAULT 'secondary-first',
  ADD COLUMN IF NOT EXISTS customer_display_theme TEXT DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS customer_display_default_state TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS customer_display_idle_message TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_payment_message TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_qr_payload TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_show_order_summary BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_show_order_total BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.pos_printer_settings.dual_monitor_enabled IS '듀얼 모니터 고객화면 기능 사용 여부';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_auto_open IS 'Windows POS 시작/설정 반영 시 고객창 자동 오픈';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_monitor_preference IS 'secondary-first | primary-only';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_theme IS 'dark | light | brand';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_default_state IS 'idle | qr';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_idle_message IS '평상시 안내 문구';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_payment_message IS '결제 화면 안내 문구';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_qr_payload IS 'QR 표시 데이터(URL/텍스트)';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_show_order_summary IS '주문중 고객화면에서 품목 목록 표시';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_show_order_total IS '주문/결제 고객화면에서 합계 표시';
