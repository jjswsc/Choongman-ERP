-- 손님 영수증 사업장 주소 인쇄 on/off (상호·Tax ID·전화는 항상 인쇄)
-- 기본 off + 기존 매장 일괄 off (간이 영수증 용지 절약)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_biz_address BOOLEAN DEFAULT false;

-- 이전 컬럼명(receipt_show_biz_info) 사용 매장 호환
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_show_biz_info BOOLEAN DEFAULT false;

UPDATE public.pos_printer_settings
SET receipt_show_biz_address = false
WHERE receipt_show_biz_address IS DISTINCT FROM false;

COMMENT ON COLUMN public.pos_printer_settings.receipt_show_biz_address IS
  'true면 손님 영수증 간이 출력에 사업장 주소 인쇄. 상호·Tax ID·전화는 설정과 무관하게 인쇄. Tax Invoice 요청 시 별도 블록은 유지.';
