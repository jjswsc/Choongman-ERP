-- 주문 취소 시 주방/체크빌(취소 전표) 자동 인쇄 ON/OFF — Supabase SQL Editor (멱등)
-- 기존 동작 유지:
--   · 주방 취소 슬립: 기존 `auto_print_kitchen_slip_on_order` 값을 복사
--   · 체크빌(void/취소 전표): 기본 ON (전체 취소 시 항상 출력하던 동작)

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS auto_print_kitchen_slip_on_cancel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_check_bill_on_cancel boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pos_printer_settings.auto_print_kitchen_slip_on_cancel IS
  '주문 전체/부분 취소 시 주방 취소 슬립 자동 인쇄';
COMMENT ON COLUMN public.pos_printer_settings.auto_print_check_bill_on_cancel IS
  '주문 전체 취소 시 체크빌(취소·void 전표) 자동 인쇄';

-- 기존 매장: 주방 주문 자동인쇄 ON이면 취소 주방도 ON으로 맞춤
UPDATE public.pos_printer_settings
SET auto_print_kitchen_slip_on_cancel = true
WHERE COALESCE(auto_print_kitchen_slip_on_order, false) = true
  AND COALESCE(auto_print_kitchen_slip_on_cancel, false) = false;
