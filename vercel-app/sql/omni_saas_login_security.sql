-- =============================================================================
-- Omni SaaS — IP allowlist (+ legacy TOTP columns; 2FA app enforce는 제거됨)
-- ⚠️ Omni Supabase에서만 실행. 충만 DB에는 실행하지 마세요.
-- =============================================================================

ALTER TABLE IF EXISTS public.tenant_policy_settings
  ADD COLUMN IF NOT EXISTS allowed_ips text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenant_policy_settings.allowed_ips IS
  'When require_ip_allowlist=true, login allowed only from these IPs/CIDRs';

-- Legacy: TOTP 컬럼은 호환용으로만 유지 (앱에서 더 이상 사용하지 않음)
ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS totp_secret text;

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.totp_secret IS 'Deprecated — admin 2FA removed from app';
COMMENT ON COLUMN public.employees.totp_enabled IS 'Deprecated — admin 2FA removed from app';
