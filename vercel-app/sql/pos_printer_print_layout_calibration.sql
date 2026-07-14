-- 매장·프린터별 80mm 열전사 가로 보정 (영수증·주방 슬립)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_inset_left_mm numeric,
  ADD COLUMN IF NOT EXISTS receipt_inset_right_mm numeric,
  ADD COLUMN IF NOT EXISTS receipt_content_nudge_left_mm numeric,
  ADD COLUMN IF NOT EXISTS kitchen_slip_padding_left_mm numeric,
  ADD COLUMN IF NOT EXISTS kitchen_slip_padding_right_mm numeric;

COMMENT ON COLUMN public.pos_printer_settings.receipt_inset_left_mm IS
  '80mm 영수증 body padding-left(mm). NULL이면 전역 기본값(5mm).';
COMMENT ON COLUMN public.pos_printer_settings.receipt_inset_right_mm IS
  '80mm 영수증 body padding-right(mm). NULL이면 전역 기본값(17mm).';
COMMENT ON COLUMN public.pos_printer_settings.receipt_content_nudge_left_mm IS
  '영수증 본문 가로 미세조정(mm, left:-n). NULL이면 전역 기본값(2mm).';
COMMENT ON COLUMN public.pos_printer_settings.kitchen_slip_padding_left_mm IS
  '주방 슬립 padding-left(mm). NULL이면 전역 기본값(2mm).';
COMMENT ON COLUMN public.pos_printer_settings.kitchen_slip_padding_right_mm IS
  '주방 슬립 padding-right(mm). NULL이면 전역 기본값(14mm).';
