-- =============================================================================
-- Omni SaaS — IP allowlist + employee TOTP 컬럼
-- ⚠️ Omni Supabase에서만 실행. 충만 DB에는 실행하지 마세요.
-- =============================================================================

ALTER TABLE IF EXISTS public.tenant_policy_settings
  ADD COLUMN IF NOT EXISTS allowed_ips text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenant_policy_settings.allowed_ips IS
  'When require_ip_allowlist=true, login allowed only from these IPs/CIDRs';

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS totp_secret text;

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.totp_secret IS 'Base32 TOTP secret (Omni admin 2FA)';
COMMENT ON COLUMN public.employees.totp_enabled IS 'When true, admin login requires TOTP if tenant require_2fa_admin';
