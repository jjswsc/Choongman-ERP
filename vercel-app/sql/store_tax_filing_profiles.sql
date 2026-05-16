-- 매장(법인)별 PP30·e-Filing용 납세자 프로필 (store_code = erp_stores.store_code)
CREATE TABLE IF NOT EXISTS public.store_tax_filing_profiles (
  store_code TEXT PRIMARY KEY,
  vendor_code TEXT NULL,
  taxpayer_name TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  branch_no TEXT NOT NULL DEFAULT '00000',
  place_of_business TEXT NULL,
  sso_account_no TEXT NOT NULL DEFAULT '',
  sso_branch_code TEXT NOT NULL DEFAULT '',
  sso_office_address TEXT NULL,
  sso_postcode TEXT NOT NULL DEFAULT '',
  sso_phone TEXT NOT NULL DEFAULT '',
  sso_fax TEXT NOT NULL DEFAULT '',
  sso_email TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);

COMMENT ON TABLE public.store_tax_filing_profiles IS '매장별 ภ.พ.30 / e-Filing 납세자 TIN·ชื่อ·สาขา';
COMMENT ON COLUMN public.store_tax_filing_profiles.vendor_code IS '연결 거래처 코드 (vendors.code)';

CREATE INDEX IF NOT EXISTS idx_store_tax_filing_profiles_vendor_code
  ON public.store_tax_filing_profiles (vendor_code);

ALTER TABLE public.store_tax_filing_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all store_tax_filing_profiles" ON public.store_tax_filing_profiles;
CREATE POLICY "Allow all store_tax_filing_profiles" ON public.store_tax_filing_profiles
  FOR ALL USING (true) WITH CHECK (true);
