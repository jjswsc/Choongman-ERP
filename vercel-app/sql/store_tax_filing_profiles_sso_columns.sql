-- Add SSO header fields to per-store filing profile table
-- Run once in Supabase SQL Editor for existing deployments.
ALTER TABLE public.store_tax_filing_profiles
  ADD COLUMN IF NOT EXISTS sso_account_no TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sso_branch_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sso_office_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS sso_postcode TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sso_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sso_fax TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sso_email TEXT NOT NULL DEFAULT '';
