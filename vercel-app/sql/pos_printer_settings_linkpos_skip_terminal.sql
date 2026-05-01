-- POS: 카드 결제 시 LINKPOS 단말/릴레이 호출 생략(금액만 수기 반영)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS linkpos_skip_terminal_for_card BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pos_printer_settings.linkpos_skip_terminal_for_card IS
  'true: 카드 금액 입력만으로 결제 진행(로컬 LINKPOS 브리지·LINKPOS_RELAY_URL 호출 안 함). 단말 연동 시 false.';
