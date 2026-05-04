-- POS 서비스처리 금액/사유 분리 저장 컬럼
-- 할인(discount_amt)과 구분해 회계·리포트에서 별도 집계 가능하도록 추가한다.

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS service_amt NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS service_reason TEXT;
