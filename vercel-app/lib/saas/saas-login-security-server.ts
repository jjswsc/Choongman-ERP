/**
 * Omni 로그인 시 IP 정책 로드 — tenantId 있을 때만.
 */
import "server-only"

import { supabaseSelectFilter } from "@/lib/supabase-server"
import { normalizeIpAllowlist } from "@/lib/saas/saas-login-security"

export type SaasLoginSecurityPolicy = {
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
        select: "require_ip_allowlist,allowed_ips",
      }
    )) as Array<{
      require_ip_allowlist?: boolean | null
      allowed_ips?: unknown
    }>
    const row = rows?.[0]
    if (!row) {
      return { requireIpAllowlist: false, allowedIps: [] }
    }
    return {
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
          { limit: 1, select: "require_ip_allowlist" }
        )) as Array<{
          require_ip_allowlist?: boolean | null
        }>
        const row = rows?.[0]
        return {
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
