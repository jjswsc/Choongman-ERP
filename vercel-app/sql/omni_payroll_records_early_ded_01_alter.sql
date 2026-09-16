-- Omni: 급여 저장용 payroll_records.early_min / early_ded
-- 증상: Save to DB → Could not find the 'early_ded' column of 'payroll_records' in the schema cache
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요. (ADD COLUMN IF NOT EXISTS 이므로 재실행은 안전)
-- payroll_records 만 변경. pos_orders 아님. POS Realtime 인쇄와 무관.

BEGIN;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS early_min NUMERIC(12,2) DEFAULT 0;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS early_ded NUMERIC(12,2) DEFAULT 0;

UPDATE public.payroll_records
SET early_min = 0
WHERE early_min IS NULL;

UPDATE public.payroll_records
SET early_ded = 0
WHERE early_ded IS NULL;

COMMENT ON COLUMN public.payroll_records.early_min IS
  '조퇴 분. 관리자 급여 표 Late 열은 late_min+early_min 합계.';

COMMENT ON COLUMN public.payroll_records.early_ded IS
  '조퇴 공제(바트). 관리자 급여 표 Late 열은 late_ded+early_ded 합계.';

COMMIT;

NOTIFY pgrst, 'reload schema';
