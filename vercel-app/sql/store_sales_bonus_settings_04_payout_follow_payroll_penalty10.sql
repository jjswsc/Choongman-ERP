-- 매출 보너스: 전 매장 지급일=익월 급여일(0) · 결근 1일당 패널티 10%
-- 적용: Supabase SQL Editor → 이 파일만 복사 → Run
-- 선행: store_sales_bonus_settings_01_table.sql, _03_designee_payout.sql
-- pos_orders 미변경 → 영업 중 실행 가능
--
-- payout_day = 0 → 앱에서 급여 주기(payroll_cycle) 지급일에 맞춤
-- absence_penalty_pct_per_day = 10 → 결근 1일당 보너스 10% 차감

ALTER TABLE public.store_sales_bonus_settings
  ALTER COLUMN payout_day SET DEFAULT 0;

ALTER TABLE public.store_sales_bonus_settings
  ALTER COLUMN absence_penalty_pct_per_day SET DEFAULT 10;

COMMENT ON COLUMN public.store_sales_bonus_settings.payout_day IS
  '0 = 익월 급여일(급여 주기 연동). 1~28 = 익월 고정 지급일. 매출은 달력월 1일~말일 집계.';

COMMENT ON COLUMN public.store_sales_bonus_settings.absence_penalty_pct_per_day IS
  '스케줄 결근 1일당 보너스에서 차감할 비율(%). 기본 10 → 1일 결근 시 10% 차감.';

UPDATE public.store_sales_bonus_settings
SET
  payout_day = 0,
  absence_penalty_pct_per_day = 10,
  updated_at = now();

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('store_sales_bonus_settings_04_payout_follow_payroll_penalty10.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
