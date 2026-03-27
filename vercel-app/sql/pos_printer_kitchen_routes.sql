-- 주방 프린터 라우팅: 대분류·카테고리·메뉴별로 주방 1/2/3 지정 (JSON)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kitchen_route_by_menu jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kitchen_route_by_category jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kitchen_route_by_category_main jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.pos_printer_settings.kitchen_route_by_menu IS '메뉴 id → 0=주방미인쇄, 1|2|3=주방';
COMMENT ON COLUMN public.pos_printer_settings.kitchen_route_by_category IS '소분류(category)명 → 0|1|2|3';
COMMENT ON COLUMN public.pos_printer_settings.kitchen_route_by_category_main IS '대분류(category_main)명 → 0|1|2|3';
