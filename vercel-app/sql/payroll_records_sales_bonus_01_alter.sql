-- 급여 기록: 매출 보너스(sales_bonus) 컬럼
-- 적용: Supabase SQL Editor → 이 파일만 복사 → Run (재실행 안전)
-- payroll_records 만 변경. pos_orders 아님. POS Realtime 인쇄와 무관.

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS sales_bonus numeric(12, 2) DEFAULT 0;

UPDATE public.payroll_records
SET sales_bonus = 0
WHERE sales_bonus IS NULL;

COMMENT ON COLUMN public.payroll_records.sales_bonus IS
  '매장 매출 구간 보너스(자동 계산). 특별보너스(spl_bonus)와 별도.';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('payroll_records_sales_bonus_01_alter.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
