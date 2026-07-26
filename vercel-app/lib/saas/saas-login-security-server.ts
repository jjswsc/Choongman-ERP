/**
 * Omni 로그인 시 IP/2FA 정책 로드 — tenantId 있을 때만.
 */
import "server-only"

import { supabaseSelectFilter } from "@/lib/supabase-server"
import { normalizeIpAllowlist } from "@/lib/saas/saas-login-security"

export type SaasLoginSecurityPolicy = {
  require2faAdmin: boolean
  requireIpAllowlist: boolean
  allowedIps: string[]
}

export async function loadSaasLoginSecurityPolicy(
  tenantId: string
): Promise<SaasLoginSecurityPolicy | null> {
  const id = String(tenantId || "").trim()
  if (!id) return null
  try {
    const rows = (await supabaseSelectFilter(
      "tenant_policy_settings",
      `tenant_id=eq.${encodeURIComponent(id)}`,
      {
        limit: 1,
        select: "require_2fa_admin,require_ip_allowlist,allowed_ips",
      }
    )) as Array<{
      require_2fa_admin?: boolean | null
      require_ip_allowlist?: boolean | null
      allowed_ips?: unknown
    }>
    const row = rows?.[0]
    if (!row) {
      return { require2faAdmin: false, requireIpAllowlist: false, allowedIps: [] }
    }
    return {
      require2faAdmin: row.require_2fa_admin === true,
      requireIpAllowlist: row.require_ip_allowlist === true,
      allowedIps: normalizeIpAllowlist(row.allowed_ips),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/allowed_ips|42703|column/i.test(msg)) {
      try {
        const rows = (await supabaseSelectFilter(
          "tenant_policy_settings",
          `tenant_id=eq.${encodeURIComponent(id)}`,
          { limit: 1, select: "require_2fa_admin,require_ip_allowlist" }
        )) as Array<{
          require_2fa_admin?: boolean | null
          require_ip_allowlist?: boolean | null
        }>
        const row = rows?.[0]
        return {
          require2faAdmin: row?.require_2fa_admin === true,
          requireIpAllowlist: row?.require_ip_allowlist === true,
          allowedIps: [],
        }
      } catch (e2) {
        console.warn("loadSaasLoginSecurityPolicy fallback:", id, e2)
        return null
      }
    }
    console.warn("loadSaasLoginSecurityPolicy:", id, e)
    return null
  }
}

export async function loadEmployeeTotpSecret(employeeId: number): Promise<{
  enabled: boolean
  secret: string
} | null> {
  const id = Math.floor(Number(employeeId) || 0)
  if (id <= 0) return null
  try {
    const rows = (await supabaseSelectFilter("employees", `id=eq.${id}`, {
      limit: 1,
      select: "totp_enabled,totp_secret",
    })) as Array<{ totp_enabled?: boolean | null; totp_secret?: string | null }>
    const row = rows?.[0]
    if (!row) return { enabled: false, secret: "" }
    return {
      enabled: row.totp_enabled === true,
      secret: String(row.totp_secret || "").trim(),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/totp_|42703|column/i.test(msg)) return { enabled: false, secret: "" }
    console.warn("loadEmployeeTotpSecret:", id, e)
    return null
  }
}
