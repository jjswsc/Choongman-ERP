-- ============================================================
-- thai_tax_pp36_pnd54_minimal.sql
-- PP.36 / PND.54 최소 원장 (ERP 내부 신고준비용)
--
-- 증상: PGRST205 Could not find the table
--   'public.vat_pp36_ledger_entries'
--   'public.withholding_tax_pnd54_entries'
-- 대상: 충만 프로덕션 (Omni에도 없으면 동일 실행)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vat_pp36_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  doc_date DATE NOT NULL,
  tax_month TEXT NOT NULL,
  supplier_name TEXT NULL,
  supplier_country TEXT NULL,
  supplier_tax_id TEXT NULL,
  service_desc TEXT NULL,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(6,2) NOT NULL DEFAULT 7,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  treaty_relief_note TEXT NULL,
  filing_status TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  submitted_by TEXT NULL,
  memo TEXT NULL,
  store_name TEXT NULL,
  tenant_id TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vat_pp36_ledger_entries ADD COLUMN IF NOT EXISTS tenant_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_vat_pp36_tax_month
  ON public.vat_pp36_ledger_entries (tax_month, store_name);
CREATE INDEX IF NOT EXISTS idx_vat_pp36_ledger_entries_tenant_id
  ON public.vat_pp36_ledger_entries (tenant_id);

CREATE TABLE IF NOT EXISTS public.withholding_tax_pnd54_entries (
  id BIGSERIAL PRIMARY KEY,
  payment_date DATE NOT NULL,
  tax_month TEXT NOT NULL,
  payee_name TEXT NULL,
  payee_country TEXT NULL,
  payee_tax_id TEXT NULL,
  income_type TEXT NULL,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  wht_rate NUMERIC(6,2) NULL,
  wht_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  treaty_relief_note TEXT NULL,
  filing_status TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  submitted_by TEXT NULL,
  memo TEXT NULL,
  store_name TEXT NULL,
  tenant_id TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.withholding_tax_pnd54_entries ADD COLUMN IF NOT EXISTS tenant_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_wht_pnd54_tax_month
  ON public.withholding_tax_pnd54_entries (tax_month, store_name);
CREATE INDEX IF NOT EXISTS idx_withholding_tax_pnd54_entries_tenant_id
  ON public.withholding_tax_pnd54_entries (tenant_id);

ALTER TABLE public.vat_pp36_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all vat_pp36_ledger_entries" ON public.vat_pp36_ledger_entries;
CREATE POLICY "Allow all vat_pp36_ledger_entries"
  ON public.vat_pp36_ledger_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.withholding_tax_pnd54_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all withholding_tax_pnd54_entries" ON public.withholding_tax_pnd54_entries;
CREATE POLICY "Allow all withholding_tax_pnd54_entries"
  ON public.withholding_tax_pnd54_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.vat_pp36_ledger_entries TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vat_pp36_ledger_entries_id_seq TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.withholding_tax_pnd54_entries TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.withholding_tax_pnd54_entries_id_seq TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
