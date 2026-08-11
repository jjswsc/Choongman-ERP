-- KBank QR: API 생략(수기 금액만 반영). 은행 MID 개통 전 기본 수기.
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kbank_skip_api_for_qr BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pos_printer_settings.kbank_skip_api_for_qr IS
  'true(기본): QR 금액만 POS에 반영·KBank generate-qr 호출 안 함. 은행 MID bind 후 false로 전환.';
