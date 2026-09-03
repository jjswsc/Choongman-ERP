-- Omni: vendors 저장에 필요한 컬럼 (PGRST204: addr 등)
-- 프로젝트: Omni Supabase SQL Editor에서만 실행.
-- 충만(레거시) DB는 이미 있을 수 있음. ADD COLUMN IF NOT EXISTS 안전.
--
-- 앱 saveVendor 가 쓰는 컬럼:
--   code, manager, phone, addr, tax_id, memo, sales_outlet,
--   direct_settlement, bank_account_no, bank_name, tenant_id
-- CSV import: ceo, balance, lat, lng

DO $$
BEGIN
  IF to_regclass('public.vendors') IS NULL THEN
    RAISE NOTICE 'skip: public.vendors not found';
    RETURN;
  END IF;

  ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS tenant_id text,
    ADD COLUMN IF NOT EXISTS code text,
    ADD COLUMN IF NOT EXISTS manager text,
    ADD COLUMN IF NOT EXISTS phone text,
    ADD COLUMN IF NOT EXISTS addr text,
    ADD COLUMN IF NOT EXISTS tax_id text,
    ADD COLUMN IF NOT EXISTS memo text,
    ADD COLUMN IF NOT EXISTS sales_outlet text,
    ADD COLUMN IF NOT EXISTS direct_settlement boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS bank_account_no text,
    ADD COLUMN IF NOT EXISTS bank_name text,
    ADD COLUMN IF NOT EXISTS ceo text,
    ADD COLUMN IF NOT EXISTS balance numeric,
    ADD COLUMN IF NOT EXISTS lat text,
    ADD COLUMN IF NOT EXISTS lng text;

  CREATE INDEX IF NOT EXISTS idx_vendors_tenant_id ON public.vendors (tenant_id);
  CREATE INDEX IF NOT EXISTS idx_vendors_code ON public.vendors (code);
END $$;

NOTIFY pgrst, 'reload schema';
