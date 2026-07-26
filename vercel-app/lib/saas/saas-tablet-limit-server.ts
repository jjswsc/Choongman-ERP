/**
 * SaaS 태블릿(max_tablets) — tenant_device_registry device_kind=tablet.
 * tenantId 있을 때만 enforce.
 */

import { DEFAULT_LIMITS_BY_TIER } from "@/lib/saas-admin-control-plane"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { supabaseCountFilter, supabaseSelectFilter } from "@/lib/supabase-server"

export type SaasTabletLimitCheck =
  | { ok: true }
  | {
      ok: false
      code: "saas_tablet_limit" | "saas_tablet_limit_unavailable"
      message: string
    }

const TABLET_LIMIT_MESSAGE =
  "SaaS tablet limit reached. Contact your administrator to increase licensed tablets."
const TABLET_LIMIT_UNAVAILABLE_MESSAGE =
  "Unable to verify SaaS tablet limit. Try again or contact support."

export function evaluateSaasTabletRegistrationBlock(params: {
  enforce: boolean
  isNewTablet: boolean
  allowOverage: boolean
  used: number
  maxTablets: number
  limitsUnavailable?: boolean
}): SaasTabletLimitCheck {
  if (!params.enforce || !params.isNewTablet) return { ok: true }
  if (params.limitsUnavailable) {
    return {
      ok: false,
      code: "saas_tablet_limit_unavailable",
      message: TABLET_LIMIT_UNAVAILABLE_MESSAGE,
    }
  }
  if (params.allowOverage) return { ok: true }
  if (params.used >= Math.max(0, Math.floor(params.maxTablets))) {
    return { ok: false, code: "saas_tablet_limit", message: TABLET_LIMIT_MESSAGE }
  }
  return { ok: true }
}

export async function countTenantActiveTablets(tenantId: string): Promise<number | null> {
  const id = String(tenantId || "").trim()
  if (!id) return 0
  try {
    return await supabaseCountFilter(
      "tenant_device_registry",
      `tenant_id=eq.${encodeURIComponent(id)}&device_kind=eq.tablet&is_active=eq.true`
    )
  } catch (e) {
    console.warn("countTenantActiveTablets:", id, e)
    return null
  }
}

export async function assertSaasTabletRegistrationAllowed(params: {
  tenantId: string | undefined | null
  deviceUuid: string
}): Promise<SaasTabletLimitCheck> {
  const tenantId = String(params.tenantId || "").trim()
  const deviceUuid = String(params.deviceUuid || "").trim()
  if (!shouldEnforceSaasForAuth(tenantId) || !deviceUuid) return { ok: true }

  let isNew = true
  try {
    const existing = (await supabaseSelectFilter(
      "tenant_device_registry",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&device_kind=eq.tablet&device_uuid=eq.${encodeURIComponent(deviceUuid)}`,
      { limit: 1, select: "id,is_active" }
    )) as Array<{ id?: number; is_active?: boolean | null }>
    if (existing?.[0]?.id && existing[0].is_active !== false) {
      isNew = false
    }
  } catch {
    isNew = true
  }

  let maxTablets = DEFAULT_LIMITS_BY_TIER.starter.maxTablets
  let allowOverage = false
  try {
    const rows = (await supabaseSelectFilter(
      "v_tenant_admin_settings",
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      { limit: 1, select: "max_tablets,allow_overage" }
    )) as Array<{ max_tablets?: unknown; allow_overage?: boolean | null }>
    const row = rows?.[0]
    maxTablets = Math.max(0, Math.floor(Number(row?.max_tablets ?? maxTablets)))
    allowOverage = row?.allow_overage === true
  } catch (e) {
    console.warn("assertSaasTabletRegistrationAllowed limits:", tenantId, e)
    return evaluateSaasTabletRegistrationBlock({
      enforce: true,
      isNewTablet: true,
      allowOverage: false,
      used: 0,
      maxTablets: 0,
      limitsUnavailable: true,
    })
  }

  const used = await countTenantActiveTablets(tenantId)
  if (used == null) {
    return evaluateSaasTabletRegistrationBlock({
      enforce: true,
      isNewTablet: isNew,
      allowOverage,
      used: 0,
      maxTablets,
      limitsUnavailable: true,
    })
  }

  return evaluateSaasTabletRegistrationBlock({
    enforce: true,
    isNewTablet: isNew,
    allowOverage,
    used,
    maxTablets,
  })
}
