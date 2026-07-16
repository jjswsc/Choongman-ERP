-- 홀(테이블) 주문 시 손님 수 필수 여부 (매장별)
-- true(기본): 손님 수 > 0 이어야 주문 가능 (충만 기존 동작)
-- false: 손님 수 0이어도 주문 가능 (Omni 등 선택 매장)

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS require_guest_count BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pos_printer_settings.require_guest_count IS
  '홀(테이블) 주문 시 손님 수(1~99) 필수 여부. true=필수(기본), false=미입력(0) 허용';
