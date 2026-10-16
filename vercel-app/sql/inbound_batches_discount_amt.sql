-- 입고 배치 헤더 할인(ส่วนลด) — IV 공급가 합과 맞추기 위한 THB 할인액
-- Supabase SQL Editor에 붙여넣어 실행하세요.
-- pos_orders Realtime 미사용 → 영업 중 실행 가능

ALTER TABLE public.inbound_batches
  ADD COLUMN IF NOT EXISTS discount_amt numeric(14, 3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.inbound_batches.discount_amt IS
  '입고 헤더 할인(THB, 공급가 기준). 저장 시 줄 단가(unit_cost)에 배분되어 재고·미지급·손익과 일치';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('inbound_batches_discount_amt.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
