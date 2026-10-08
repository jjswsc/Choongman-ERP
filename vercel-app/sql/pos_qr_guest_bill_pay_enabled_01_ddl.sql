-- 손님 테이블 PromptPay 결제 on/off (주문·세션은 유지, 결제만 카운터)

ALTER TABLE IF EXISTS public.pos_qr_order_store_settings
  ADD COLUMN IF NOT EXISTS guest_bill_pay_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pos_qr_order_store_settings.guest_bill_pay_enabled IS
  'false면 손님 폰 테이블 QR 결제(입장·별도·계산서) 숨김·API 거부. 카운터 POS 결제는 유지.';
