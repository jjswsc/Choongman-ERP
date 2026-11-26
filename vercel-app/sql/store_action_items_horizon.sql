-- 매장 개선 과제 — 기간 성격(horizon): day | week | month_30 | month_cal
-- 신규 등록 시 기한 자동: 당일=오늘, 주간=+7일, month_30=+30일, month_cal=해당 월 말일(방콕)
-- 레거시 month → month_30
-- 실행: Supabase SQL Editor에 이 파일만 복사 → Run
-- pos_orders 등 Realtime 구독 테이블은 건드리지 않음 → 영업 중 실행 가능

ALTER TABLE public.store_action_items
  ADD COLUMN IF NOT EXISTS horizon text NOT NULL DEFAULT 'week';

COMMENT ON COLUMN public.store_action_items.horizon IS
  '과제 기간 성격: day | week | month_30(+30) | month_cal(해당 월 말일). 옛 month=month_30';

CREATE INDEX IF NOT EXISTS idx_store_action_items_horizon_status
  ON public.store_action_items (horizon, status);

-- 레거시 month → month_30
UPDATE public.store_action_items
SET horizon = 'month_30'
WHERE horizon = 'month';

-- 기존 행: created_at(방콕 일자) 대비 due_date 일수로 추정
-- 같은 달 말일이면 month_cal, 그 외 긴 기한은 month_30 (재실행 시 due 기준 재계산)
UPDATE public.store_action_items
SET horizon = CASE
  WHEN due_date IS NULL THEN 'week'
  WHEN (due_date - ((created_at AT TIME ZONE 'Asia/Bangkok')::date)) <= 1 THEN 'day'
  WHEN (due_date - ((created_at AT TIME ZONE 'Asia/Bangkok')::date)) <= 10 THEN 'week'
  WHEN due_date = (
    (date_trunc('month', (created_at AT TIME ZONE 'Asia/Bangkok')::date)
      + interval '1 month - 1 day')::date
  ) THEN 'month_cal'
  ELSE 'month_30'
END;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('store_action_items_horizon.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
