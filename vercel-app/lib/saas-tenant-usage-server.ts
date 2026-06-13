import type { AuditLogItem, BillingEventItem } from "./saas-admin-control-plane"
import {
  getBangkokMonthStartYmd,
  toBangkokStartIso,
} from "./saas-admin-control-plane"
import { countErpStoresForTenant } from "./saas-tenant-stores-server"
import { supabaseCountFilter, supabaseRpc, supabaseSelectFilter } from "./supabase-server"

export type TenantUsageCounts = {
  stores: number
  managerAccounts: number
  staffAccounts: number
  tablets: number
  posDevices: number
  monthlyOrders: number
}

export const SAAS_TENANT_LIST_LIMIT = 500
const AUDIT_BILLING_PER_TENANT = 20
const USAGE_FALLBACK_CONCURRENCY = 12

export function saasTenantInFilter(tenantIds: string[], column = "tenant_id"): string {
  const ids = tenantIds.map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) return `${column}=eq.__none__`
  return `${column}=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`
}

function emptyUsage(): TenantUsageCounts {
  return {
    stores: 0,
    managerAccounts: 0,
    staffAccounts: 0,
    tablets: 0,
    posDevices: 0,
    monthlyOrders: 0,
  }
}

type UsageRpcRow = {
  tenant_id?: string
  stores?: number | string
  manager_accounts?: number | string
  staff_accounts?: number | string
  tablets?: number | string
  pos_devices?: number | string
  monthly_orders?: number | string
}

async function countSafe(filter: string, table: string): Promise<number> {
  try {
    return await supabaseCountFilter(table, filter)
  } catch {
    return 0
  }
}

async function buildUsageFallback(tenantId: string, companyName = ""): Promise<TenantUsageCounts> {
  const tenant = encodeURIComponent(tenantId)
  const monthStartIso = toBangkokStartIso(getBangkokMonthStartYmd())
  const stores = await countErpStoresForTenant(tenantId, companyName)
  const staff = await countSafe(`tenant_id=eq.${tenant}`, "employees")
  const managers = await countSafe(
    `tenant_id=eq.${tenant}&or=(role.ilike.*manager*,role.ilike.*franchisee*)`,
    "employees"
  )
  const tablets = await countSafe(`tenant_id=eq.${tenant}&device_kind=eq.tablet&is_active=eq.true`, "tenant_device_registry")
  const pos = await countSafe(`tenant_id=eq.${tenant}&device_kind=eq.pos&is_active=eq.true`, "tenant_device_registry")
  const orders =
    monthStartIso == null
      ? 0
      : await countSafe(
          `tenant_id=eq.${tenant}&created_at=gte.${encodeURIComponent(monthStartIso)}`,
          "pos_orders"
        )
  return {
    stores,
    managerAccounts: managers,
    staffAccounts: staff,
    tablets,
    posDevices: pos,
    monthlyOrders: orders,
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0
  async function next(): Promise<void> {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  await Promise.all(workers)
}

function parseUsageRow(row: UsageRpcRow): TenantUsageCounts {
  return {
    stores: Math.max(0, Number(row.stores ?? 0)),
    managerAccounts: Math.max(0, Number(row.manager_accounts ?? 0)),
    staffAccounts: Math.max(0, Number(row.staff_accounts ?? 0)),
    tablets: Math.max(0, Number(row.tablets ?? 0)),
    posDevices: Math.max(0, Number(row.pos_devices ?? 0)),
    monthlyOrders: Math.max(0, Number(row.monthly_orders ?? 0)),
  }
}

/** tenant usage 일괄 조회 — RPC 우선, 미배포 시 병렬 fallback */
export async function loadTenantUsageBatch(
  tenants: Array<{ id: string; companyName?: string }>
): Promise<Map<string, TenantUsageCounts>> {
  const map = new Map<string, TenantUsageCounts>()
  if (tenants.length === 0) return map

  const tenantIds = tenants.map((t) => t.id)
  for (const id of tenantIds) map.set(id, emptyUsage())

  let rpcOk = false
  try {
    const rows = await supabaseRpc<UsageRpcRow[]>("get_saas_tenant_usage_batch", {
      p_tenant_ids: tenantIds,
    })
    if (Array.isArray(rows)) {
      rpcOk = true
      for (const row of rows) {
        const id = String(row.tenant_id || "").trim()
        if (!id) continue
        map.set(id, parseUsageRow(row))
      }
    }
  } catch {
    rpcOk = false
  }

  if (rpcOk) {
    const needsLegacyStoreCheck = tenants.filter((t) => (map.get(t.id)?.stores ?? 0) === 0)
    if (needsLegacyStoreCheck.length > 0) {
      await runPool(needsLegacyStoreCheck, USAGE_FALLBACK_CONCURRENCY, async (t) => {
        const legacyStores = await countErpStoresForTenant(t.id, t.companyName || "")
        if (legacyStores <= 0) return
        const prev = map.get(t.id) || emptyUsage()
        map.set(t.id, { ...prev, stores: legacyStores })
      })
    }
    return map
  }

  await runPool(tenants, USAGE_FALLBACK_CONCURRENCY, async (t) => {
    map.set(t.id, await buildUsageFallback(t.id, t.companyName || ""))
  })
  return map
}

type AuditRpcRow = {
  id?: number
  tenant_id?: string
  action?: string | null
  actor_name?: string | null
  actor_role?: string | null
  changed_at?: string | null
  summary?: string | null
  payload_json?: unknown
}

function auditItemFromRow(row: AuditRpcRow): AuditLogItem {
  const payload = row.payload_json
  const employeeId =
    payload && typeof payload === "object" && "employeeId" in (payload as Record<string, unknown>)
      ? Number((payload as Record<string, unknown>).employeeId || 0)
      : 0
  return {
    id: Number(row.id || 0),
    action: String(row.action || "tenant.settings.updated"),
    actorName: String(row.actor_name || "-"),
    actorRole: String(row.actor_role || "-"),
    changedAt: String(row.changed_at || ""),
    summary: String(row.summary || ""),
    employeeId: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
  }
}

/** tenant별 최근 감사 로그 — RPC 우선 */
export async function loadTenantAuditRecentBatch(tenantIds: string[]): Promise<Map<string, AuditLogItem[]>> {
  const map = new Map<string, AuditLogItem[]>()
  if (tenantIds.length === 0) return map

  try {
    const rows = await supabaseRpc<AuditRpcRow[]>("get_saas_tenant_audit_recent", {
      p_tenant_ids: tenantIds,
      p_per_tenant: AUDIT_BILLING_PER_TENANT,
    })
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const key = String(row.tenant_id || "").trim()
        if (!key) continue
        const prev = map.get(key) || []
        if (prev.length >= AUDIT_BILLING_PER_TENANT) continue
        prev.push(auditItemFromRow(row))
        map.set(key, prev)
      }
      return map
    }
  } catch {
    /* fallback */
  }

  const rawRows = (await supabaseSelectFilter(
    "saas_audit_logs",
    saasTenantInFilter(tenantIds),
    { order: "changed_at.desc", limit: Math.min(5000, tenantIds.length * AUDIT_BILLING_PER_TENANT) }
  ).catch(() => [])) as AuditRpcRow[]

  for (const row of rawRows) {
    const key = String(row.tenant_id || "").trim()
    if (!key) continue
    const prev = map.get(key) || []
    if (prev.length >= AUDIT_BILLING_PER_TENANT) continue
    prev.push(auditItemFromRow(row))
    map.set(key, prev)
  }
  return map
}

type BillingRpcRow = {
  id?: number
  tenant_id?: string
  event_type?: string | null
  amount?: number | null
  currency?: string | null
  status?: string | null
  happened_at?: string | null
  memo?: string | null
}

function billingItemFromRow(row: BillingRpcRow): BillingEventItem {
  return {
    id: Number(row.id || 0),
    eventType: String(row.event_type || "billing.updated"),
    amount: Number(row.amount || 0),
    currency: String(row.currency || "THB"),
    status: String(row.status || "unknown"),
    happenedAt: String(row.happened_at || ""),
    memo: String(row.memo || ""),
  }
}

/** tenant별 최근 과금 이벤트 — RPC 우선 */
export async function loadTenantBillingRecentBatch(tenantIds: string[]): Promise<Map<string, BillingEventItem[]>> {
  const map = new Map<string, BillingEventItem[]>()
  if (tenantIds.length === 0) return map

  try {
    const rows = await supabaseRpc<BillingRpcRow[]>("get_saas_tenant_billing_recent", {
      p_tenant_ids: tenantIds,
      p_per_tenant: AUDIT_BILLING_PER_TENANT,
    })
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const key = String(row.tenant_id || "").trim()
        if (!key) continue
        const prev = map.get(key) || []
        if (prev.length >= AUDIT_BILLING_PER_TENANT) continue
        prev.push(billingItemFromRow(row))
        map.set(key, prev)
      }
      return map
    }
  } catch {
    /* fallback */
  }

  const rawRows = (await supabaseSelectFilter(
    "saas_billing_events",
    saasTenantInFilter(tenantIds),
    { order: "happened_at.desc", limit: Math.min(5000, tenantIds.length * AUDIT_BILLING_PER_TENANT) }
  ).catch(() => [])) as BillingRpcRow[]

  for (const row of rawRows) {
    const key = String(row.tenant_id || "").trim()
    if (!key) continue
    const prev = map.get(key) || []
    if (prev.length >= AUDIT_BILLING_PER_TENANT) continue
    prev.push(billingItemFromRow(row))
    map.set(key, prev)
  }
  return map
}
