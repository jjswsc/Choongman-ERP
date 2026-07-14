-- 최종가격: 별도 % 항목(부가세·서비스·기타) 누적 적용 방식·순서
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS fee_stack_mode TEXT DEFAULT 'parallel',
  ADD COLUMN IF NOT EXISTS fee_stack_order JSONB DEFAULT '["service","vat","other"]'::jsonb;

COMMENT ON COLUMN public.pos_printer_settings.fee_stack_mode IS
  'parallel=각각 기준금액에 독립 계산 | sequential=fee_stack_order 순서로 누적';
COMMENT ON COLUMN public.pos_printer_settings.fee_stack_order IS
  'sequential일 때 적용 순서 JSON 배열. 예: ["service","vat","other"]';
