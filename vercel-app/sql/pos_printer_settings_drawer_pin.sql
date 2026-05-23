-- 금전 서랍(돈통) 6자리 PIN — 매장별 pos_printer_settings
-- Supabase SQL Editor에서 실행 (idempotent).

ALTER TABLE IF EXISTS public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS drawer_pin_hash TEXT NULL;

COMMENT ON COLUMN public.pos_printer_settings.drawer_pin_hash IS '금전 서랍 수동/업무 오픈용 6자리 PIN bcrypt 해시. NULL이면 PIN 미설정(기존 동작).';
