-- POS: 카드 결제 시 LINKPOS 단말/릴레이 호출 생략(금액만 수기 반영)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS linkpos_skip_terminal_for_card BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pos_printer_settings.linkpos_skip_terminal_for_card IS
  'true(기본): 카드 금액만 수동 입력·LINKPOS 단말 호출 안 함. 은행 단말 연동 시 false + NEXT_PUBLIC_LINKPOS_CARD_ENABLED.';
