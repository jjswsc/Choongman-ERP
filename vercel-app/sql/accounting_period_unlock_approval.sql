-- 회계기간 잠금해제 승인 정보 컬럼 (idempotent)
DO $$
BEGIN
  IF to_regclass('public.accounting_periods') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NULL';
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlocked_by TEXT NULL';
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlock_reason TEXT NULL';
    EXECUTE 'ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS unlock_approved_by TEXT NULL';
  ELSE
    RAISE NOTICE 'accounting_periods table not found; skip unlock approval columns';
  END IF;
END $$;
