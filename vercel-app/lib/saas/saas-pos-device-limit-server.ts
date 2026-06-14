/**
 * SaaS POS 단말(max_pos_devices) 등록 한도 — tenantId 있을 때만 enforce.
 * JWT tenantId 없음(충만) → no-op.
 */

import { DEFAULT_LIMITS_BY_TIER } from "@/lib/saas-admin-control-plane"
import { resolveTenantIdForStore } from "@/lib/saas-tenant-pos-licensed-server"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { supabaseSelectFilter } from "@/lib/supabase-server"

export type TenantPosDeviceLimit = {
  maxPosDevices: number
  allowOverage: boolean
}

export type SaasPosDeviceLimitCheck =
  | { ok: true }
  | { ok: false; code: "saas_pos_device_limit"; message: string }

const POS_DEVICE_LIMIT_MESSAGE =
  "SaaS POS device limit reached. Contact your administrator to increase licensed terminals."

/** 순수 판정 — unit test용 */
export function evaluateSaasPosDeviceRegistrationBlock(params: {
  enforce: boolean
  isNewDeviceForTenant: boolean
  allowOverage: boolean
  used: number
  maxPosDevices: number
}): SaasPosDeviceLimitCheck {
  if (!params.enforce || !params.isNewDeviceForTenant) return { ok: true }
  if (params.allowOverage) return { ok: true }
  if (params.used >= Math.max(0, Math.floor(params.maxPosDevices))) {
    return { ok: false, code: "saas_pos_device_limit", message: POS_DEVICE_LIMIT_MESSAGE }
  }
  return { ok: true }
}

export async function loadTenantPosDeviceLimit(tenantId: string): Promise<TenantPosDeviceLimit | null> {
  const id = String(tenantId || "").trim()
  if (!id) return null
  try {
    const rows = (await supabaseSelectFilter(
      "v_tenant_admin_settings",
      `tenant_id=eq.${encodeURIComponent(id)}`,
      { limit: 1, select: "max_pos_devices,allow_overage" }
    )) as Array<{ max_pos_devices?: unknown; allow_overage?: boolean | null }>
    const row = rows?.[0]
    const fallbackMax = DEFAULT_LIMITS_BY_TIER.starter.maxPosDevices
    return {
      maxPosDevices: Math.max(0, Math.floor(Number(row?.max_pos_devices ?? fallbackMax))),
      allowOverage: row?.allow_overage === true,
    }
  } catch (e) {
    console.warn("loadTenantPosDeviceLimit:", id, e)
    return null
  }
}

/** 테넌트 소속 매장 pos_connected_devices 기준 고유 device_token 수 */
export async function countTenantConnectedPosDevices(tenantId: string): Promise<number> {
  const id = String(tenantId || "").trim()
  if (!id) return 0
  try {
    const storeRows = (await supabaseSelectFilter("erp_stores", `tenant_id=eq.${encodeURIComponent(id)}`, {
      limit: 5000,
      select: "store_code",
    })) as Array<{ store_code?: string | null }>
    const codes = (storeRows || [])
      .map((r) => String(r.store_code || "").trim())
      .filter(Boolean)
    if (codes.length === 0) return 0

    const filter = `store_code=in.(${codes.map((c) => encodeURIComponent(c)).join(",")})`
    const deviceRows = (await supabaseSelectFilter("pos_connected_devices", filter, {
      limit: 10000,
      select: "device_token",
    })) as Array<{ device_token?: string | null }>
    const tokens = new Set<string>()
    for (const row of deviceRows || []) {
      const token = String(row.device_token || "").trim()
      if (token) tokens.add(token)
    }
    return tokens.size
  } catch (e) {
    console.warn("countTenantConnectedPosDevices:", id, e)
    return 0
  }
}

/**
 * 신규 POS 단말 등록 전 SaaS 한도 검사.
 * - tenantId 없음 → 허용
 * - 동일 store+token 재등록(heartbeat) → 허용
 * - allowOverage → 허용
 * - 한도 조회 실패 → fail-open(허용) + warn
 */
export async function assertSaasPosDeviceRegistrationAllowed(params: {
  storeCode: string
  deviceToken: string
  /** false면 tenant 전체에서 이미 등록된 token — 신규 카운트 제외 */
  isNewDeviceForTenant?: boolean
}): Promise<SaasPosDeviceLimitCheck> {
  const storeCode = String(params.storeCode || "").trim()
  const deviceToken = String(params.deviceToken || "").trim()
  if (!storeCode || !deviceToken) return { ok: true }

  const tenantId = await resolveTenantIdForStore(storeCode)
  if (!shouldEnforceSaasForAuth(tenantId)) return { ok: true }

  if (params.isNewDeviceForTenant === false) return { ok: true }

  const limits = await loadTenantPosDeviceLimit(tenantId!)
  if (!limits) return { ok: true }

  const used = await countTenantConnectedPosDevices(tenantId!)
  return evaluateSaasPosDeviceRegistrationBlock({
    enforce: true,
    isNewDeviceForTenant: true,
    allowOverage: limits.allowOverage,
    used,
    maxPosDevices: limits.maxPosDevices,
  })
}

/** store 내 token 존재 여부 + tenant 전체 신규 여부 */
export async function resolveSaasPosDeviceNewForTenant(params: {
  storeCode: string
  deviceToken: string
  storeDeviceTokens: string[]
}): Promise<boolean> {
  const token = String(params.deviceToken || "").trim()
  if (!token) return false
  if (params.storeDeviceTokens.some((t) => String(t).trim() === token)) return false

  const tenantId = await resolveTenantIdForStore(params.storeCode)
  if (!shouldEnforceSaasForAuth(tenantId)) return false

  try {
    const storeRows = (await supabaseSelectFilter("erp_stores", `tenant_id=eq.${encodeURIComponent(tenantId!)}`, {
      limit: 5000,
      select: "store_code",
    })) as Array<{ store_code?: string | null }>
    const codes = (storeRows || [])
      .map((r) => String(r.store_code || "").trim())
      .filter(Boolean)
    if (codes.length === 0) return true

    const filter = `store_code=in.(${codes.map((c) => encodeURIComponent(c)).join(",")})&device_token=eq.${encodeURIComponent(token)}`
    const existing = (await supabaseSelectFilter("pos_connected_devices", filter, {
      limit: 1,
      select: "device_token",
    })) as Array<{ device_token?: string | null }>
    return !(Array.isArray(existing) && existing.length > 0)
  } catch {
    return true
  }
}
