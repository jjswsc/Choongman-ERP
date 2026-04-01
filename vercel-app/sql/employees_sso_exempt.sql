-- Supabase SQL Editor에서 1회 실행: SSO(ประกันสังคม) 미가입·면제 직원 (서류 미비 등)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sso_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.sso_exempt IS 'true면 급여 계산 시 SSO 공제 0 (미가입·외국인 서류 미비 등)';
