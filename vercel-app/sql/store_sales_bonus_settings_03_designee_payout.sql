-- 매출 보너스: 배수 지정자(매장당 1명) + 지급일(익월 N일)
-- 적용: Supabase SQL Editor → 이 파일만 복사 → Run
-- pos_orders 미변경 → 영업 중 실행 가능

ALTER TABLE public.store_sales_bonus_settings
  ADD COLUMN IF NOT EXISTS double_bonus_employee_id integer NULL;

ALTER TABLE public.store_sales_bonus_settings
  ADD COLUMN IF NOT EXISTS payout_day integer NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.store_sales_bonus_settings.double_bonus_employee_id IS
  '배수(기본 ×2)를 받을 직원 employees.id. 역할(매니저)이 아니라 매장당 1명 지정.';

COMMENT ON COLUMN public.store_sales_bonus_settings.payout_day IS
  '0 = 익월 급여일 연동. 1~28 = 익월 고정 지급일. 매출은 달력 1일~말일 집계. (전 매장 일괄 변경은 _04 참고)';

-- 역할 기반 배수는 앱에서 더 이상 쓰지 않음. 기본값 변경(0·패널티 10%)은 _04.

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('store_sales_bonus_settings_03_designee_payout.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
