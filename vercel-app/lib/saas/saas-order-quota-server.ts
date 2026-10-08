/**
 * SaaS 월 주문 쿼터(monthly_order_quota) — tenantId 있을 때만 enforce.
 * JWT tenantId 없음(충만) → no-op.
 */

import {
  DEFAULT_LIMITS_BY_TIER,
  getBangkokMonthStartYmd,
  toBangkokStartIso,
} from "@/lib/saas-admin-control-plane"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { supabaseCountFilter, supabaseSelectFilter } from "@/lib/supabase-server"

export type TenantOrderQuotaLimit = {
  monthlyOrderQuota: number
  allowOverage: boolean
}

export type SaasOrderQuotaCheck =
  | { ok: true }
  | {
      ok: false
      code: "saas_order_quota" | "saas_order_quota_unavailable"
      message: string
    }

const ORDER_QUOTA_MESSAGE =
  "SaaS monthly order quota reached. Contact your administrator to increase the limit."
const ORDER_QUOTA_UNAVAILABLE_MESSAGE =
  "Unable to verify SaaS monthly order quota. Try again or contact support."

/** 연속 주문 시 COUNT 왕복 완화 (프로세스 메모리) */
const MONTHLY_COUNT_TTL_MS = 45_000
const LIMITS_TTL_MS = 60_000

type CountCacheEntry = { at: number; used: number }
type LimitsCacheEntry = { at: number; limits: TenantOrderQuotaLimit }

const monthlyCountCache = new Map<string, CountCacheEntry>()
const limitsCache = new Map<string, LimitsCacheEntry>()

/** unit test / 배포 핫리로드용 */
export function clearSaasOrderQuotaServerCaches(): void {
  monthlyCountCache.clear()
  limitsCache.clear()
}

/** 순수 판정 — unit test용 */
export function evaluateSaasOrderQuotaBlock(params: {
  enforce: boolean
  allowOverage: boolean
  used: number
  monthlyOrderQuota: number
  limitsUnavailable?: boolean
}): SaasOrderQuotaCheck {
  if (!params.enforce) return { ok: true }
  if (params.limitsUnavailable) {
    return {
      ok: false,
      code: "saas_order_quota_unavailable",
      message: ORDER_QUOTA_UNAVAILABLE_MESSAGE,
    }
  }
  if (params.allowOverage) return { ok: true }
  const max = Math.max(0, Math.floor(params.monthlyOrderQuota))
  if (params.used >= max) {
    return { ok: false, code: "saas_order_quota", message: ORDER_QUOTA_MESSAGE }
  }
  return { ok: true }
}

export async function loadTenantOrderQuotaLimit(
  tenantId: string
): Promise<TenantOrderQuotaLimit | null> {
  const id = String(tenantId || "").trim()
  if (!id) return null
  const cached = limitsCache.get(id)
  if (cached && Date.now() - cached.at < LIMITS_TTL_MS) return cached.limits
  try {
    const rows = (await supabaseSelectFilter(
      "v_tenant_admin_settings",
      `tenant_id=eq.${encodeURIComponent(id)}`,
      { limit: 1, select: "monthly_order_quota,allow_overage" }
    )) as Array<{ monthly_order_quota?: unknown; allow_overage?: boolean | null }>
    const row = rows?.[0]
    const fallbackMax = DEFAULT_LIMITS_BY_TIER.starter.monthlyOrderQuota
    const limits: TenantOrderQuotaLimit = {
      monthlyOrderQuota: Math.max(0, Math.floor(Number(row?.monthly_order_quota ?? fallbackMax))),
      allowOverage: row?.allow_overage === true,
    }
    limitsCache.set(id, { at: Date.now(), limits })
    return limits
  } catch (e) {
    console.warn("loadTenantOrderQuotaLimit:", id, e)
    return null
  }
}

/** 방콕 월 시작 이후 pos_orders 건수. 조회 실패 시 null */
export async function countTenantMonthlyOrders(tenantId: string): Promise<number | null> {
  const id = String(tenantId || "").trim()
  if (!id) return 0
  const cached = monthlyCountCache.get(id)
  if (cached && Date.now() - cached.at < MONTHLY_COUNT_TTL_MS) return cached.used
  try {
    const monthStartIso = toBangkokStartIso(getBangkokMonthStartYmd())
    if (!monthStartIso) return 0
    const used = await supabaseCountFilter(
      "pos_orders",
      `tenant_id=eq.${encodeURIComponent(id)}&created_at=gte.${encodeURIComponent(monthStartIso)}`
    )
    if (used != null && Number.isFinite(used)) {
      monthlyCountCache.set(id, { at: Date.now(), used })
    }
    return used
  } catch (e) {
    console.warn("countTenantMonthlyOrders:", id, e)
    return null
  }
}

/**
 * POS 주문 생성 전 SaaS 월 쿼터 검사.
 * - tenantId 없음 → 허용
 * - allowOverage → COUNT 없이 허용
 * - 한도/사용량 조회 실패 → fail-closed
 */
export async function assertSaasOrderQuotaAllowed(params: {
  tenantId: string | undefined | null
}): Promise<SaasOrderQuotaCheck> {
  const tenantId = String(params.tenantId || "").trim()
  if (!shouldEnforceSaasForAuth(tenantId)) return { ok: true }

  const limits = await loadTenantOrderQuotaLimit(tenantId)
  if (!limits) {
    return evaluateSaasOrderQuotaBlock({
      enforce: true,
      allowOverage: false,
      used: 0,
      monthlyOrderQuota: 0,
      limitsUnavailable: true,
    })
  }

  /** overage 허용 테넌트는 매 주문 COUNT가 불필요 (핫패스) */
  if (limits.allowOverage) {
    return { ok: true }
  }

  const used = await countTenantMonthlyOrders(tenantId)
  if (used == null) {
    return evaluateSaasOrderQuotaBlock({
      enforce: true,
      allowOverage: limits.allowOverage,
      used: 0,
      monthlyOrderQuota: limits.monthlyOrderQuota,
      limitsUnavailable: true,
    })
  }

  return evaluateSaasOrderQuotaBlock({
    enforce: true,
    allowOverage: limits.allowOverage,
    used,
    monthlyOrderQuota: limits.monthlyOrderQuota,
  })
}
