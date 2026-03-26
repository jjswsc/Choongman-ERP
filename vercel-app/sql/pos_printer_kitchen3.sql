-- 주방 프린터 3대(카테고리 3분할)용. Supabase SQL Editor에서 매장 DB에 적용.
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kitchen3_categories jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.pos_printer_settings.kitchen3_categories IS 'kitchen_mode=3일 때 주방3으로 보낼 메뉴 카테고리명 배열';
