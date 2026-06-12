import type { TenantItem } from "./saas-admin-control-plane"
import { supabaseCountFilter, supabaseRpc, supabaseSelect, supabaseSelectFilter } from "./supabase-server"
import {
  emptyOnboardingSteps,
  parseOnboardingFlags,
  parseOnboardingSteps,
  resolveOnboardingSteps,
  type OnboardingFlags,
  type OnboardingStatusRow,
  type OnboardingStepStatus,
} from "./saas-onboarding-status"

type TenantFlagsRow = { id?: string; onboarding_flags?: unknown; is_active?: boolean | null }

async function countEnabledIntegrations(tenantId: string): Promise<number> {
  try {
    return await supabaseCountFilter(
      "tenant_integrations",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&is_enabled=eq.true`
    )
  } catch {
    return 0
  }
}

async function countEnabledModules(tenantId: string): Promise<number> {
  try {
    return await supabaseCountFilter(
      "tenant_module_pricing",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&is_enabled=eq.true`
    )
  } catch {
    return 0
  }
}

async function countActiveStores(tenantId: string): Promise<number> {
  try {
    return await supabaseCountFilter(
      "erp_stores",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true`
    )
  } catch {
    try {
      return await supabaseCountFilter("erp_stores", `tenant_id=eq.${encodeURIComponent(tenantId)}`)
    } catch {
      return 0
    }
  }
}

async function countManagersWithActiveStore(tenantId: string): Promise<number> {
  try {
    const enc = encodeURIComponent(tenantId)
    return await supabaseCountFilter(
      "employees",
      `tenant_id=eq.${enc}&or=(role.ilike.*manager*,role.ilike.*franchisee*)&resign_date=is.null`
    )
  } catch {
    return 0
  }
}

async function loadTenantFlags(tenantId: string): Promise<OnboardingFlags> {
  try {
    const rows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 1,
      select: "id,onboarding_flags,is_active",
    })) as TenantFlagsRow[]
    return parseOnboardingFlags(rows[0]?.onboarding_flags)
  } catch {
    return {}
  }
}

async function loadTenantFlagsMap(): Promise<Map<string, OnboardingFlags>> {
  const map = new Map<string, OnboardingFlags>()
  try {
    const rows = (await supabaseSelect("tenants", {
      order: "created_at.asc",
      limit: 500,
      select: "id,onboarding_flags",
    })) as TenantFlagsRow[]
    for (const row of rows) {
      if (!row.id) continue
      map.set(row.id, parseOnboardingFlags(row.onboarding_flags))
    }
  } catch {
    /* column may not exist yet */
  }
  return map
}

async function tryRpcStatus(tenantId: string): Promise<OnboardingStatusRow | null> {
  try {
    const raw = await supabaseRpc("get_tenant_onboarding_status", { p_tenant_id: tenantId })
    if (!raw || typeof raw !== "object") return null
    const o = raw as Record<string, unknown>
    const steps = parseOnboardingSteps(o.steps)
    if (!steps) return null
    return {
      tenantId: String(o.tenantId || tenantId),
      found: o.found !== false,
      flags: parseOnboardingFlags(o.flags),
      steps,
      counts:
        o.counts && typeof o.counts === "object"
          ? (o.counts as OnboardingStatusRow["counts"])
          : undefined,
    }
  } catch {
    return null
  }
}

async function tryRpcAll(): Promise<OnboardingStatusRow[] | null> {
  try {
    const raw = await supabaseRpc("get_all_tenant_onboarding_status", {})
    if (!Array.isArray(raw)) return null
    const rows: OnboardingStatusRow[] = []
    for (const item of raw) {
      if (!item || typeof item !== "object") continue
      const o = item as Record<string, unknown>
      const steps = parseOnboardingSteps(o.steps)
      if (!steps) continue
      rows.push({
        tenantId: String(o.tenantId || ""),
        found: o.found !== false,
        flags: parseOnboardingFlags(o.flags),
        steps,
        counts:
          o.counts && typeof o.counts === "object"
            ? (o.counts as OnboardingStatusRow["counts"])
            : undefined,
      })
    }
    return rows
  } catch {
    return null
  }
}

export async function buildOnboardingStatusForTenant(params: {
  tenantId: string
  usage?: { stores?: number; managerAccounts?: number }
  pricing?: { modulePrices?: unknown }
}): Promise<OnboardingStatusRow> {
  const usage = {
    stores: Math.max(0, Number(params.usage?.stores ?? 0)),
    managerAccounts: Math.max(0, Number(params.usage?.managerAccounts ?? 0)),
    staffAccounts: 0,
    tablets: 0,
    posDevices: 0,
    monthlyOrders: 0,
  }
  const pricing = { modulePrices: params.pricing?.modulePrices } as Pick<TenantItem["pricing"], "modulePrices">
  const rpc = await tryRpcStatus(params.tenantId)
  if (rpc) return rpc

  const flags = await loadTenantFlags(params.tenantId)
  const enabledIntegrationCount = await countEnabledIntegrations(params.tenantId)
  const activeStores = await countActiveStores(params.tenantId)
  const managers = await countManagersWithActiveStore(params.tenantId)
  const enabledModules = await countEnabledModules(params.tenantId)

  const steps = resolveOnboardingSteps({
    tenant: { usage, pricing },
    flags,
    enabledIntegrationCount,
    companyOk: true,
    storeOk: activeStores > 0 || usage.stores > 0,
    adminOk: managers > 0 || usage.managerAccounts > 0,
  })

  if (enabledModules > 0 && !flags.pricingConfirmed) {
    steps.pricing = true
  }

  return {
    tenantId: params.tenantId,
    found: true,
    flags,
    steps,
    counts: {
      activeStores,
      managersWithStore: managers,
      enabledModules,
      enabledIntegrations: enabledIntegrationCount,
    },
  }
}

export async function buildAllOnboardingStatuses(
  tenants: Array<{ id: string; usage?: { stores?: number; managerAccounts?: number }; pricing?: { modulePrices?: unknown } }>
): Promise<OnboardingStatusRow[]> {
  const rpcRows = await tryRpcAll()
  if (rpcRows && rpcRows.length > 0) return rpcRows

  const flagsMap = await loadTenantFlagsMap()
  const rows: OnboardingStatusRow[] = []

  for (const tenant of tenants) {
    const flags = flagsMap.get(tenant.id) || {}
    const enabledIntegrationCount = await countEnabledIntegrations(tenant.id)
    const activeStores = await countActiveStores(tenant.id)
    const managers = await countManagersWithActiveStore(tenant.id)
    const enabledModules = await countEnabledModules(tenant.id)
    const usage = {
      stores: Math.max(0, Number(tenant.usage?.stores ?? 0)),
      managerAccounts: Math.max(0, Number(tenant.usage?.managerAccounts ?? 0)),
      staffAccounts: 0,
      tablets: 0,
      posDevices: 0,
      monthlyOrders: 0,
    }

    const steps = resolveOnboardingSteps({
      tenant: { usage, pricing: { modulePrices: tenant.pricing?.modulePrices } as Pick<TenantItem["pricing"], "modulePrices"> },
      flags,
      enabledIntegrationCount,
      companyOk: true,
      storeOk: activeStores > 0 || usage.stores > 0,
      adminOk: managers > 0 || usage.managerAccounts > 0,
    })
    if (enabledModules > 0 && !flags.pricingConfirmed) steps.pricing = true

    rows.push({
      tenantId: tenant.id,
      found: true,
      flags,
      steps,
      counts: {
        activeStores,
        managersWithStore: managers,
        enabledModules,
        enabledIntegrations: enabledIntegrationCount,
      },
    })
  }

  return rows
}

export async function mergeOnboardingFlags(
  tenantId: string,
  patch: Partial<OnboardingFlags>
): Promise<OnboardingFlags> {
  const current = await loadTenantFlags(tenantId)
  return {
    ...current,
    ...patch,
  }
}

export function stepsFromStatusRow(row: OnboardingStatusRow | undefined, fallback: OnboardingStepStatus): OnboardingStepStatus {
  if (!row?.steps) return fallback
  return { ...emptyOnboardingSteps(), ...row.steps }
}
