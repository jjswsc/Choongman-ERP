-- 결제 모달 열기 직전 최종 주문서(홀 주문서) 자동 인쇄 — Supabase SQL Editor (멱등)

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS auto_print_final_order_before_payment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pos_printer_settings.auto_print_final_order_before_payment IS
  '결제 버튼으로 결제 모달이 열리기 직전, 손님 확인용 최종 주문서 1장 자동 인쇄';
