-- 체크빌·결제 영수증에서 QR 뷔페 포함 메뉴(0원) 숨김. 기본 OFF(전부 표시). 관리자에서 켠 매장만 숨김.
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS hide_buffet_included_on_guest_bill BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.pos_printer_settings
  ALTER COLUMN hide_buffet_included_on_guest_bill SET DEFAULT false;

UPDATE public.pos_printer_settings
SET hide_buffet_included_on_guest_bill = false
WHERE hide_buffet_included_on_guest_bill IS DISTINCT FROM false;

COMMENT ON COLUMN public.pos_printer_settings.hide_buffet_included_on_guest_bill IS
  'true: 체크빌·결제 영수증에서 뷔페 포함 메뉴(buffetIncluded)와 Item: Buffet/Extra 태그를 숨김. 기본 false(전부 표시). 패키지 요금·유료 Extra·주방 전표는 그대로.';
