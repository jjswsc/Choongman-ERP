-- 급여 명세서: 직원 앱 노출은 공지(แจ้งประกาศ) 이후에만
-- published_at IS NULL → 직원 My Slip 숨김
-- published_at IS NOT NULL → 직원에게 표시
--
-- 기존에 이미 확정·배포된 분은 그대로 보이도록 created_at 으로 백필합니다.
-- (신규 저장·임시저장은 published_at 을 NULL 로 두고, 공지 버튼에서만 채웁니다.)

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.payroll_records.published_at IS
  '직원 앱(내 급여 명세서) 공개 시각. NULL이면 미공개(관리자만 조회). แจ้งประกาศ 시 설정.';

CREATE INDEX IF NOT EXISTS idx_payroll_records_published_at
  ON public.payroll_records (month, published_at);

-- 기존 확정분만 공개 유지 (임시저장 '대기'는 비공개)
UPDATE public.payroll_records
SET published_at = COALESCE(created_at, NOW())
WHERE published_at IS NULL
  AND COALESCE(status, '') <> '대기';
