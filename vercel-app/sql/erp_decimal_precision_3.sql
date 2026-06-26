-- ERP 품목 원가·입고 단가: 소수 셋째 자리까지 (기존 NUMERIC(12,2) → NUMERIC(14,3))
-- Supabase SQL Editor에서 1회 실행. 앱 배포와 함께 적용.

ALTER TABLE public.items
  ALTER COLUMN cost TYPE NUMERIC(14,3);

ALTER TABLE public.stock_logs
  ALTER COLUMN unit_cost TYPE NUMERIC(14,3);

ALTER TABLE public.inbound_batches
  ALTER COLUMN total_amount TYPE NUMERIC(14,3);

COMMENT ON COLUMN public.items.cost IS '매입가 (총 금액). 소수 셋째 자리까지.';
COMMENT ON COLUMN public.stock_logs.unit_cost IS '입고·이동 시 줄 단가. NULL이면 items.cost 사용. 소수 셋째 자리까지.';
