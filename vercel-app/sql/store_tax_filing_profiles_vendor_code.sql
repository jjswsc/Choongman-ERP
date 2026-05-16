-- Add vendor linkage for store tax filing profiles.
-- Run once in Supabase SQL Editor for existing deployments.
ALTER TABLE public.store_tax_filing_profiles
  ADD COLUMN IF NOT EXISTS vendor_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_store_tax_filing_profiles_vendor_code
  ON public.store_tax_filing_profiles (vendor_code);
