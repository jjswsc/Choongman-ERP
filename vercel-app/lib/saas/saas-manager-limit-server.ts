/**
 * SaaS 매니저 계정(max_manager_accounts) — Manager/Franchisee 역할.
 * tenantId 있을 때만 enforce.
 */

import { isManagerOrFranchiseeRole } from "@/lib/permissions"
import { DEFAULT_LIMITS_BY_TIER } from "@/lib/saas-admin-control-plane"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { supabaseCountFilter, supabaseSelectFilter } from "@/lib/supabase-server"

export type SaasManagerLimitCheck =
  | { ok: true }
  | {
      ok: false
      code: "saas_manager_limit" | "saas_manager_limit_unavailable"
      message: string
    }

const MANAGER_LIMIT_MESSAGE =
  "SaaS manager account limit reached. Contact your administrator to increase licensed manager seats."
const MANAGER_LIMIT_UNAVAILABLE_MESSAGE =
  "Unable to verify SaaS manager account limit. Try again or contact support."

export function roleCountsAsManagerSeat(role: string): boolean {
  return isManagerOrFranchiseeRole(role)
}

export function evaluateSaasManagerRegistrationBlock(params: {
  enforce: boolean
  /** 이번에 매니저 좌석으로 잡히는 추가 수 (신규 1, 또는 역할 승격 1) */
  addingManagerSeats: number
  allowOverage: boolean
  used: number
  maxManagerAccounts: number
  limitsUnavailable?: boolean
}): SaasManagerLimitCheck {
  if (!params.enforce) return { ok: true }
  if (params.limitsUnavailable) {
    return {
      ok: false,
      code: "saas_manager_limit_unavailable",
      message: MANAGER_LIMIT_UNAVAILABLE_MESSAGE,
    }
  }
  if (params.allowOverage) return { ok: true }
  const add = Math.max(0, Math.floor(params.addingManagerSeats))
  if (add <= 0) return { ok: true }
  const max = Math.max(0, Math.floor(params.maxManagerAccounts))
  if (params.used + add > max) {
    return { ok: false, code: "saas_manager_limit", message: MANAGER_LIMIT_MESSAGE }
  }
  return { ok: true }
}

export async function countTenantManagerAccounts(tenantId: string): Promise<number | null> {
  const id = String(tenantId || "").trim()
  if (!id) return 0
  try {
    return await supabaseCountFilter(
      "employees",
      `tenant_id=eq.${encodeURIComponent(id)}&or=(role.ilike.*manager*,role.ilike.*franchisee*)`
    )
  } catch (e) {
    console.warn("countTenantManagerAccounts:", id, e)
    return null
  }
}

export async function assertSaasManagerRegistrationAllowed(params: {
  tenantId: string | undefined | null
  /** 추가될 매니저 좌석 수 */
  addingManagerSeats?: number
  /** CSV 교체 등: 교체 후 매니저 총원 (used=0으로 검사) */
  proposedManagerTotalAfterReplace?: number
}): Promise<SaasManagerLimitCheck> {
  const tenantId = String(params.tenantId || "").trim()
  if (!shouldEnforceSaasForAuth(tenantId)) return { ok: true }

  let maxManagerAccounts = DEFAULT_LIMITS_BY_TIER.starter.maxManagerAccounts
  let allowOverage = false
  try {
    const rows = (await supabaseSelectFilter(
      "v_tenant_admin_settings",
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      { limit: 1, select: "max_manager_accounts,allow_overage" }
    )) as Array<{ max_manager_accounts?: unknown; allow_overage?: boolean | null }>
    const row = rows?.[0]
    maxManagerAccounts = Math.max(
      0,
      Math.floor(Number(row?.max_manager_accounts ?? maxManagerAccounts))
    )
    allowOverage = row?.allow_overage === true
  } catch (e) {
    console.warn("assertSaasManagerRegistrationAllowed limits:", tenantId, e)
    return evaluateSaasManagerRegistrationBlock({
      enforce: true,
      addingManagerSeats: 1,
      allowOverage: false,
      used: 0,
      maxManagerAccounts: 0,
      limitsUnavailable: true,
    })
  }

  if (params.proposedManagerTotalAfterReplace != null) {
    return evaluateSaasManagerRegistrationBlock({
      enforce: true,
      addingManagerSeats: Math.max(0, Math.floor(params.proposedManagerTotalAfterReplace)),
      allowOverage,
      used: 0,
      maxManagerAccounts,
    })
  }

  const used = await countTenantManagerAccounts(tenantId)
  if (used == null) {
    return evaluateSaasManagerRegistrationBlock({
      enforce: true,
      addingManagerSeats: 1,
      allowOverage,
      used: 0,
      maxManagerAccounts,
      limitsUnavailable: true,
    })
  }

  return evaluateSaasManagerRegistrationBlock({
    enforce: true,
    addingManagerSeats: params.addingManagerSeats ?? 1,
    allowOverage,
    used,
    maxManagerAccounts,
  })
}
