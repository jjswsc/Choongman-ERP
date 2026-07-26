/**
 * Omni SaaS — 연체·유예 종료 시 tenants.is_active=false 자동 반영.
 * 충만 DB에는 tenants가 없거나 cron이 Omni만 스케줄되면 무영향.
 */
import "server-only"

import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { DEFAULT_POLICY, resolveTenantStatus } from "@/lib/saas-admin-control-plane"
import { SAAS_TENANT_LIST_LIMIT } from "@/lib/saas-tenant-usage-server"
import { supabaseSelect, supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"

export type AutoSuspendResult = {
  checked: number
  suspended: number
  skipped: number
  errors: number
}

type SubRow = {
  tenant_id?: string
  subscription_status?: string | null
  trial_end_at?: string | null
  next_billing_at?: string | null
  overdue_grace_days?: number | null
  auto_suspend_on_overdue?: boolean | null
  last_payment_status?: string | null
}

type TenantRow = {
  id?: string
  is_active?: boolean | null
}

export function shouldAutoSuspendTenant(params: {
  isActive: boolean
  subscriptionStatus?: string | null
  trialEndYmd?: string
  nextBillingYmd?: string
  overdueGraceDays?: number
  autoSuspendOnOverdue?: boolean
  lastPaymentStatus?: string | null
  nowBangkokYmd?: string
}): boolean {
  if (params.isActive === false) return false
  const status = resolveTenantStatus({
    explicitStatus: params.subscriptionStatus || "active",
    trialEndYmd: params.trialEndYmd,
    nextBillingYmd: params.nextBillingYmd,
    overdueGraceDays: params.overdueGraceDays ?? DEFAULT_POLICY.overdueGraceDays,
    autoSuspendOnOverdue: params.autoSuspendOnOverdue ?? DEFAULT_POLICY.autoSuspendOnOverdue,
    lastPaymentStatus: params.lastPaymentStatus,
    nowBangkokYmd: params.nowBangkokYmd,
  })
  return status === "suspended"
}

export async function runSaasAutoSuspendPass(
  limit = SAAS_TENANT_LIST_LIMIT
): Promise<AutoSuspendResult> {
  const result: AutoSuspendResult = { checked: 0, suspended: 0, skipped: 0, errors: 0 }
  const nowYmd = getBangkokTodayDateString()

  let list: TenantRow[] = []
  try {
    list = (await supabaseSelect("tenants", {
      limit,
      select: "id,is_active",
    })) as TenantRow[]
  } catch (e) {
    console.warn("runSaasAutoSuspendPass: tenants select failed (non-Omni?)", e)
    return result
  }

  const activeList = (list || []).filter((t) => {
    const id = String(t.id || "").trim()
    return id && t.is_active !== false
  })
  if (activeList.length === 0) return result

  const ids = activeList.map((t) => String(t.id).trim())
  let subRows: SubRow[] = []
  try {
    subRows = (await supabaseSelectFilter(
      "tenant_subscriptions",
      `tenant_id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`,
      {
        limit,
        select:
          "tenant_id,subscription_status,trial_end_at,next_billing_at,overdue_grace_days,auto_suspend_on_overdue,last_payment_status",
      }
    )) as SubRow[]
  } catch (e) {
    console.warn("runSaasAutoSuspendPass: subscriptions select failed", e)
    return result
  }

  const subByTenant = new Map<string, SubRow>()
  for (const s of subRows || []) {
    const tid = String(s.tenant_id || "").trim()
    if (tid) subByTenant.set(tid, s)
  }

  for (const t of activeList) {
    const tenantId = String(t.id || "").trim()
    if (!tenantId) continue
    result.checked += 1
    const sub = subByTenant.get(tenantId)
    if (!sub) {
      result.skipped += 1
      continue
    }
    const doSuspend = shouldAutoSuspendTenant({
      isActive: true,
      subscriptionStatus: sub.subscription_status,
      trialEndYmd: String(sub.trial_end_at || "").slice(0, 10),
      nextBillingYmd: String(sub.next_billing_at || "").slice(0, 10),
      overdueGraceDays: Number(sub.overdue_grace_days ?? DEFAULT_POLICY.overdueGraceDays),
      autoSuspendOnOverdue: sub.auto_suspend_on_overdue ?? DEFAULT_POLICY.autoSuspendOnOverdue,
      lastPaymentStatus: sub.last_payment_status,
      nowBangkokYmd: nowYmd,
    })
    if (!doSuspend) {
      result.skipped += 1
      continue
    }
    try {
      await supabaseUpdateByFilter("tenants", `id=eq.${encodeURIComponent(tenantId)}`, {
        is_active: false,
      })
      await supabaseUpdateByFilter(
        "tenant_subscriptions",
        `tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { subscription_status: "suspended" }
      ).catch(() => undefined)
      result.suspended += 1
    } catch (e) {
      console.error("runSaasAutoSuspendPass:", tenantId, e)
      result.errors += 1
    }
  }

  return result
}
