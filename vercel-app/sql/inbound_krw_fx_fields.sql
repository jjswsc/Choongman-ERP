-- 입고 한국 수입: 원화 단가 + 수동 환율(1 THB당 KRW) 보관
-- Supabase SQL Editor에 붙여넣어 실행하세요.
-- 재고·미지급·손익은 기존처럼 unit_cost / total_amount(THB)만 사용합니다.

ALTER TABLE public.inbound_batches
  ADD COLUMN IF NOT EXISTS source_currency text NOT NULL DEFAULT 'THB';

ALTER TABLE public.inbound_batches
  ADD COLUMN IF NOT EXISTS fx_rate numeric(18, 6) DEFAULT NULL;

COMMENT ON COLUMN public.inbound_batches.source_currency IS '입고 입력 통화: THB(기본) | KRW';
COMMENT ON COLUMN public.inbound_batches.fx_rate IS 'KRW 입고 시 환율: 1 THB당 KRW (바트단가 = 원화단가 / fx_rate)';

ALTER TABLE public.stock_logs
  ADD COLUMN IF NOT EXISTS source_unit_cost numeric(18, 3) DEFAULT NULL;

COMMENT ON COLUMN public.stock_logs.source_unit_cost IS 'KRW 입고 시 원화 단가. THB 입고는 null. unit_cost는 항상 THB';
