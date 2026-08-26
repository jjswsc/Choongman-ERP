-- 급여 주기(컷오프) 저장용. 계산 기간·지급일을 행에 남겨 과거 확정월을 재해석하지 않는다.
-- 영업 중 POS 출력과 무관(payroll_records 만 변경).

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS period_start DATE NULL;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS period_end DATE NULL;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS pay_date DATE NULL;

COMMENT ON COLUMN public.payroll_records.period_start IS
  '해당 주기 근태 시작일(방콕). 미배포·과거 행은 NULL → 달력 1일로 간주.';

COMMENT ON COLUMN public.payroll_records.period_end IS
  '해당 주기 근태 종료일(방콕). 미배포·과거 행은 NULL → 달력 말일로 간주.';

COMMENT ON COLUMN public.payroll_records.pay_date IS
  '해당 주기 실지급일(방콕). 미배포·과거 행은 NULL → 익월 5일로 간주.';
