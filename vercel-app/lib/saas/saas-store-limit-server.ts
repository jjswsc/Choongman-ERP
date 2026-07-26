/**
 * SaaS 매장 수(max_stores) 한도 — tenantId 있을 때만 enforce.
 */

import { DEFAULT_LIMITS_BY_TIER } from "@/lib/saas-admin-control-plane"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { countErpStoresForTenant } from "@/lib/saas-tenant-stores-server"
import { supabaseSelectFilter } from "@/lib/supabase-server"

export type SaasStoreLimitCheck =
  | { ok: true }
  | { ok: false; code: "saas_store_limit" | "saas_store_limit_unavailable"; message: string }

const STORE_LIMIT_MESSAGE =
  "SaaS store limit reached. Contact your administrator to increase licensed stores."
const STORE_LIMIT_UNAVAILABLE_MESSAGE =
  "Unable to verify SaaS store limit. Try again or contact support."

export function evaluateSaasStoreRegistrationBlock(params: {
  enforce: boolean
  allowOverage: boolean
  used: number
  maxStores: number
  limitsUnavailable?: boolean
}): SaasStoreLimitCheck {
  if (!params.enforce) return { ok: true }
  if (params.limitsUnavailable) {
    return {
      ok: false,
      code: "saas_store_limit_unavailable",
      message: STORE_LIMIT_UNAVAILABLE_MESSAGE,
    }
  }
  if (params.allowOverage) return { ok: true }
  if (params.used >= Math.max(0, Math.floor(params.maxStores))) {
    return { ok: false, code: "saas_store_limit", message: STORE_LIMIT_MESSAGE }
  }
  return { ok: true }
}

export async function assertSaasStoreRegistrationAllowed(params: {
  tenantId: string
  companyName?: string
}): Promise<SaasStoreLimitCheck> {
  const tenantId = String(params.tenantId || "").trim()
  if (!shouldEnforceSaasForAuth(tenantId)) return { ok: true }

  let maxStores = DEFAULT_LIMITS_BY_TIER.starter.maxStores
  let allowOverage = false
  try {
    const rows = (await supabaseSelectFilter(
      "v_tenant_admin_settings",
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      { limit: 1, select: "max_stores,allow_overage" }
    )) as Array<{ max_stores?: unknown; allow_overage?: boolean | null }>
    const row = rows?.[0]
    maxStores = Math.max(0, Math.floor(Number(row?.max_stores ?? maxStores)))
    allowOverage = row?.allow_overage === true
  } catch (e) {
    console.warn("assertSaasStoreRegistrationAllowed limits:", tenantId, e)
    return evaluateSaasStoreRegistrationBlock({
      enforce: true,
      allowOverage: false,
      used: 0,
      maxStores: 0,
      limitsUnavailable: true,
    })
  }

  let used: number
  try {
    used = await countErpStoresForTenant(tenantId, params.companyName || "")
  } catch (e) {
    console.warn("assertSaasStoreRegistrationAllowed count:", tenantId, e)
    return evaluateSaasStoreRegistrationBlock({
      enforce: true,
      allowOverage,
      used: 0,
      maxStores,
      limitsUnavailable: true,
    })
  }

  return evaluateSaasStoreRegistrationBlock({
    enforce: true,
    allowOverage,
    used,
    maxStores,
  })
}
