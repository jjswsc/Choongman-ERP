-- 손님 영수증 사업장 정보(상호·Tax ID·주소·연락처) 인쇄 on/off
-- 기본 off + 기존 매장 일괄 off (간이 영수증 용지 절약)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_biz_info BOOLEAN DEFAULT false;

UPDATE public.pos_printer_settings
SET receipt_show_biz_info = false
WHERE receipt_show_biz_info IS DISTINCT FROM false;

COMMENT ON COLUMN public.pos_printer_settings.receipt_show_biz_info IS
  'true면 손님 영수증 간이 출력에 사업장 정보 블록 인쇄. Tax Invoice 요청 시 별도 블록은 유지.';
