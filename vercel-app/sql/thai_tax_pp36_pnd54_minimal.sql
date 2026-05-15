-- PP.36 / PND.54 최소 원장 스키마 (ERP 내부 신고준비용)

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
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vat_pp36_tax_month
  ON public.vat_pp36_ledger_entries (tax_month, store_name);

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
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wht_pnd54_tax_month
  ON public.withholding_tax_pnd54_entries (tax_month, store_name);
