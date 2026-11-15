-- 매장 매출 보너스 설정 (구간·결근 패널티·역할 배수)
-- 적용: Supabase SQL Editor → 이 파일만 복사 → Run (재실행 안전)
-- pos_orders 등 Realtime 구독 테이블은 건드리지 않음 → 영업 중 실행 가능

CREATE TABLE IF NOT EXISTS public.store_sales_bonus_settings (
  store_code text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  absence_penalty_pct_per_day numeric(8, 4) NOT NULL DEFAULT 0,
  manager_multiplier numeric(8, 4) NOT NULL DEFAULT 2,
  staff_multiplier numeric(8, 4) NOT NULL DEFAULT 1,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_sales_bonus_settings IS
  '매장별 매출 구간 보너스 설정. tiers: [{threshold, amount}] 누적. 결근 1일당 보너스에서 penalty% 차감.';

COMMENT ON COLUMN public.store_sales_bonus_settings.tiers IS
  'JSON 배열 [{ "threshold": number, "amount": number }]. 매출 >= threshold 인 구간 amount를 누적 합산.';

COMMENT ON COLUMN public.store_sales_bonus_settings.absence_penalty_pct_per_day IS
  '스케줄 결근 1일당 보너스에서 차감할 비율(%). 예: 5 → 2일 결근 시 10% 차감.';

COMMENT ON COLUMN public.store_sales_bonus_settings.manager_multiplier IS
  '매니저/점장 role 배수 (기본 2).';

COMMENT ON COLUMN public.store_sales_bonus_settings.staff_multiplier IS
  '일반 직원 배수 (기본 1).';

ALTER TABLE public.store_sales_bonus_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('store_sales_bonus_settings_01_table.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
