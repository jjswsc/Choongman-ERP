-- 급여 명세서: 직원 앱 노출은 공지(แจ้งประกาศ) 이후에만
-- published_at IS NULL → 직원 My Slip 숨김
-- published_at IS NOT NULL → 직원에게 표시
--
-- 주의: 기존 확정분을 자동 공개(백필)하지 않습니다.
-- 이미 직원에게 보여준 과거 달이 있으면 월별로 수동 공개하세요.
--   UPDATE public.payroll_records
--   SET published_at = COALESCE(created_at, NOW())
--   WHERE left(COALESCE(month,''),7) = '2026-06'
--     AND published_at IS NULL
--     AND COALESCE(status,'') <> '대기';

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.payroll_records.published_at IS
  '직원 앱(내 급여 명세서) 공개 시각. NULL이면 미공개(관리자만 조회). แจ้งประกาศ 시 설정.';

CREATE INDEX IF NOT EXISTS idx_payroll_records_published_at
  ON public.payroll_records (month, published_at);
