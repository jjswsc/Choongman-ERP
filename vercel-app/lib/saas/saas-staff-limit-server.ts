/**
 * SaaS 직원 계정(max_staff_accounts) 한도 — tenantId 있을 때만 enforce.
 * JWT tenantId 없음(충만) → no-op.
 */

import { DEFAULT_LIMITS_BY_TIER } from "@/lib/saas-admin-control-plane"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { supabaseCountFilter, supabaseSelectFilter } from "@/lib/supabase-server"

export type TenantStaffLimit = {
  maxStaffAccounts: number
  allowOverage: boolean
}

export type SaasStaffLimitCheck =
  | { ok: true }
  | { ok: false; code: "saas_staff_limit" | "saas_staff_limit_unavailable"; message: string }

const STAFF_LIMIT_MESSAGE =
  "SaaS staff account limit reached. Contact your administrator to increase licensed accounts."
const STAFF_LIMIT_UNAVAILABLE_MESSAGE =
  "Unable to verify SaaS staff account limit. Try again or contact support."

/** 순수 판정 — unit test용 */
export function evaluateSaasStaffRegistrationBlock(params: {
  enforce: boolean
  /** 신규로 추가되는 계정 수 (보통 1, CSV면 교체 후 총원) */
  addingCount: number
  allowOverage: boolean
  used: number
  maxStaffAccounts: number
  /** true면 used 조회 실패 등 — 신규 등록 차단 */
  limitsUnavailable?: boolean
}): SaasStaffLimitCheck {
  if (!params.enforce) return { ok: true }
  if (params.limitsUnavailable) {
    return {
      ok: false,
      code: "saas_staff_limit_unavailable",
      message: STAFF_LIMIT_UNAVAILABLE_MESSAGE,
    }
  }
  if (params.allowOverage) return { ok: true }
  const add = Math.max(0, Math.floor(params.addingCount))
  if (add <= 0) return { ok: true }
  const max = Math.max(0, Math.floor(params.maxStaffAccounts))
  if (params.used + add > max) {
    return { ok: false, code: "saas_staff_limit", message: STAFF_LIMIT_MESSAGE }
  }
  return { ok: true }
}

export async function loadTenantStaffLimit(tenantId: string): Promise<TenantStaffLimit | null> {
  const id = String(tenantId || "").trim()
  if (!id) return null
  try {
    const rows = (await supabaseSelectFilter(
      "v_tenant_admin_settings",
      `tenant_id=eq.${encodeURIComponent(id)}`,
      { limit: 1, select: "max_staff_accounts,allow_overage" }
    )) as Array<{ max_staff_accounts?: unknown; allow_overage?: boolean | null }>
    const row = rows?.[0]
    const fallbackMax = DEFAULT_LIMITS_BY_TIER.starter.maxStaffAccounts
    return {
      maxStaffAccounts: Math.max(0, Math.floor(Number(row?.max_staff_accounts ?? fallbackMax))),
      allowOverage: row?.allow_overage === true,
    }
  } catch (e) {
    console.warn("loadTenantStaffLimit:", id, e)
    return null
  }
}

/** 테넌트 employees 행 수 (usage 집계와 동일 기준) */
export async function countTenantStaffAccounts(tenantId: string): Promise<number | null> {
  const id = String(tenantId || "").trim()
  if (!id) return 0
  try {
    return await supabaseCountFilter("employees", `tenant_id=eq.${encodeURIComponent(id)}`)
  } catch (e) {
    console.warn("countTenantStaffAccounts:", id, e)
    return null
  }
}

/**
 * 신규 직원 등록 전 SaaS 한도 검사.
 * - tenantId 없음 → 허용
 * - allowOverage → 허용
 * - 한도/사용량 조회 실패 → fail-closed(거부)
 */
export async function assertSaasStaffRegistrationAllowed(params: {
  tenantId: string | undefined | null
  /** 이번에 추가할 인원 (신규 1명, CSV 교체면 교체 후 총원과 used=0으로 호출) */
  addingCount?: number
  /**
   * CSV 등 테넌트 전체 교체: used를 0으로 두고 proposedTotal로 한도만 검사.
   * 지정 시 addingCount 대신 사용.
   */
  proposedTotalAfterReplace?: number
}): Promise<SaasStaffLimitCheck> {
  const tenantId = String(params.tenantId || "").trim()
  if (!shouldEnforceSaasForAuth(tenantId)) return { ok: true }

  const limits = await loadTenantStaffLimit(tenantId)
  if (!limits) {
    return evaluateSaasStaffRegistrationBlock({
      enforce: true,
      addingCount: 1,
      allowOverage: false,
      used: 0,
      maxStaffAccounts: 0,
      limitsUnavailable: true,
    })
  }

  if (params.proposedTotalAfterReplace != null) {
    const proposed = Math.max(0, Math.floor(params.proposedTotalAfterReplace))
    return evaluateSaasStaffRegistrationBlock({
      enforce: true,
      addingCount: proposed,
      allowOverage: limits.allowOverage,
      used: 0,
      maxStaffAccounts: limits.maxStaffAccounts,
    })
  }

  const used = await countTenantStaffAccounts(tenantId)
  if (used == null) {
    return evaluateSaasStaffRegistrationBlock({
      enforce: true,
      addingCount: 1,
      allowOverage: limits.allowOverage,
      used: 0,
      maxStaffAccounts: limits.maxStaffAccounts,
      limitsUnavailable: true,
    })
  }

  return evaluateSaasStaffRegistrationBlock({
    enforce: true,
    addingCount: params.addingCount ?? 1,
    allowOverage: limits.allowOverage,
    used,
    maxStaffAccounts: limits.maxStaffAccounts,
  })
}
