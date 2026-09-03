-- Omni/SaaS: 직원 등록 화면에 필요한 HR 컬럼 (phone 등)
-- 프로젝트: Omni Supabase SQL Editor에서 실행.
-- 충만(레거시) DB는 이미 있을 수 있음. ADD COLUMN IF NOT EXISTS 이므로 재실행 안전.
--
-- 증상: 직원 저장 시
--   column employees.phone does not exist (Postgres 42703)

DO $$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE NOTICE 'skip: public.employees not found';
    RETURN;
  END IF;

  ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS tenant_id text,
    ADD COLUMN IF NOT EXISTS nick text,
    ADD COLUMN IF NOT EXISTS join_date date,
    ADD COLUMN IF NOT EXISTS resign_date date,
    ADD COLUMN IF NOT EXISTS employee_code text,
    ADD COLUMN IF NOT EXISTS extra_stores jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS name_title text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS birth date,
    ADD COLUMN IF NOT EXISTS nation text,
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS sal_type text,
    ADD COLUMN IF NOT EXISTS sal_amt numeric,
    ADD COLUMN IF NOT EXISTS annual_leave_days numeric,
    ADD COLUMN IF NOT EXISTS id_number text,
    ADD COLUMN IF NOT EXISTS id_card_photo text,
    ADD COLUMN IF NOT EXISTS tax_id text,
    ADD COLUMN IF NOT EXISTS sso_number text,
    ADD COLUMN IF NOT EXISTS sso_exempt boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS address text,
    ADD COLUMN IF NOT EXISTS bank_name text,
    ADD COLUMN IF NOT EXISTS account_number text,
    ADD COLUMN IF NOT EXISTS position_allowance numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS haz_allow numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attendance_allowance numeric,
    ADD COLUMN IF NOT EXISTS grade text,
    ADD COLUMN IF NOT EXISTS photo text,
    ADD COLUMN IF NOT EXISTS employment_status text DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS can_manage_office_payroll boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_by text,
    ADD COLUMN IF NOT EXISTS delete_reason text;
END $$;

NOTIFY pgrst, 'reload schema';
