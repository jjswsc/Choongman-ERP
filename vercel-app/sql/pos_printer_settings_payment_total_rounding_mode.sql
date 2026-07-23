-- 결제 합계 반올림/반내림/그대로 (최종가격 설정)
-- Supabase SQL Editor에 붙여넣어 실행하세요.

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS payment_total_rounding_mode text DEFAULT 'round';

COMMENT ON COLUMN public.pos_printer_settings.payment_total_rounding_mode IS
  'POS payment total rounding: round | floor | none';
