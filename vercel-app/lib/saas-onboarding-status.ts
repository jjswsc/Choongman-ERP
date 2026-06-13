import type { TenantItem } from "./saas-admin-control-plane"
import { normalizeModulePrices, SAAS_MODULE_KEYS } from "./saas-module-pricing"

export type OnboardingStepKey = "company" | "store" | "admin" | "pricing" | "integrations" | "verify"

export const ONBOARDING_STEP_ORDER: OnboardingStepKey[] = [
  "company",
  "store",
  "admin",
  "pricing",
  "integrations",
  "verify",
]

export type OnboardingFlags = {
  pricingConfirmed?: boolean
  integrationsSkipped?: boolean
  loginVerified?: boolean
}

export type OnboardingStepStatus = Record<OnboardingStepKey, boolean>

export type OnboardingStatusRow = {
  tenantId: string
  found: boolean
  flags: OnboardingFlags
  steps: OnboardingStepStatus
  counts?: {
    activeStores?: number
    managersWithStore?: number
    enabledModules?: number
    enabledIntegrations?: number
  }
}

export function emptyOnboardingSteps(): OnboardingStepStatus {
  return {
    company: false,
    store: false,
    admin: false,
    pricing: false,
    integrations: false,
    verify: false,
  }
}

export function hasPricingConfigured(tenant: { pricing?: Pick<TenantItem["pricing"], "modulePrices"> }, flags?: OnboardingFlags): boolean {
  if (flags?.pricingConfirmed === true) return true
  const modules = normalizeModulePrices(tenant.pricing?.modulePrices)
  return SAAS_MODULE_KEYS.some((key) => modules[key]?.isEnabled === true)
}

export function hasIntegrationsConfigured(flags?: OnboardingFlags, enabledIntegrationCount = 0): boolean {
  if (flags?.integrationsSkipped === true) return true
  return enabledIntegrationCount > 0
}

export function resolveOnboardingSteps(params: {
  tenant: { usage: Pick<TenantItem["usage"], "stores" | "managerAccounts">; pricing?: Pick<TenantItem["pricing"], "modulePrices"> }
  flags?: OnboardingFlags
  enabledIntegrationCount?: number
  companyOk?: boolean
  storeOk?: boolean
  adminOk?: boolean
}): OnboardingStepStatus {
  const { tenant, flags, enabledIntegrationCount = 0 } = params
  return {
    company: params.companyOk ?? true,
    store: params.storeOk ?? tenant.usage.stores > 0,
    admin: params.adminOk ?? tenant.usage.managerAccounts > 0,
    pricing: hasPricingConfigured(tenant, flags),
    integrations: hasIntegrationsConfigured(flags, enabledIntegrationCount),
    verify: flags?.loginVerified === true,
  }
}

/** @deprecated use resolveOnboardingSteps */
export function getTenantOnboardingSteps(tenant: Pick<TenantItem, "usage">): Pick<OnboardingStepStatus, "company" | "store" | "admin"> {
  return {
    company: true,
    store: tenant.usage.stores > 0,
    admin: tenant.usage.managerAccounts > 0,
  }
}

export function isOnboardingComplete(steps: Partial<OnboardingStepStatus>): boolean {
  return ONBOARDING_STEP_ORDER.every((key) => steps[key] === true)
}

export function firstIncompleteStep(steps: OnboardingStepStatus): OnboardingStepKey | null {
  for (const key of ONBOARDING_STEP_ORDER) {
    if (!steps[key]) return key
  }
  return null
}

export function completedStepCount(steps: Partial<OnboardingStepStatus>): number {
  return ONBOARDING_STEP_ORDER.filter((key) => steps[key] === true).length
}

export function assertCanAddStore(tenant: Pick<TenantItem, "usage" | "limits">): { ok: true } | { ok: false; reason: "limit" } {
  if (tenant.usage.stores >= tenant.limits.maxStores) return { ok: false, reason: "limit" }
  return { ok: true }
}

export function assertCanAddManager(tenant: Pick<TenantItem, "usage" | "limits">): { ok: true } | { ok: false; reason: "limit" } {
  if (tenant.usage.managerAccounts >= tenant.limits.maxManagerAccounts) return { ok: false, reason: "limit" }
  return { ok: true }
}

export function generateOnboardingPassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export function parseOnboardingFlags(raw: unknown): OnboardingFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  return {
    pricingConfirmed: o.pricingConfirmed === true,
    integrationsSkipped: o.integrationsSkipped === true,
    loginVerified: o.loginVerified === true,
  }
}

export function parseOnboardingSteps(raw: unknown): OnboardingStepStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const steps = emptyOnboardingSteps()
  for (const key of ONBOARDING_STEP_ORDER) {
    steps[key] = o[key] === true
  }
  return steps
}

export function onboardingStorageKey(tenantId: string): string {
  return `saas-onboard-draft:${tenantId}`
}

export function onboardingFlagsStorageKey(tenantId: string): string {
  return `saas-onboard-flags:${tenantId}`
}

export function readLocalOnboardingFlags(tenantId: string): OnboardingFlags {
  if (typeof window === "undefined" || !tenantId) return {}
  try {
    const raw = sessionStorage.getItem(onboardingFlagsStorageKey(tenantId))
    if (!raw) return {}
    return parseOnboardingFlags(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function mergeLocalOnboardingFlags(tenantId: string, patch: OnboardingFlags): OnboardingFlags {
  const merged = { ...readLocalOnboardingFlags(tenantId), ...patch }
  if (typeof window !== "undefined" && tenantId) {
    try {
      sessionStorage.setItem(onboardingFlagsStorageKey(tenantId), JSON.stringify(merged))
    } catch {
      /* ignore quota */
    }
  }
  return merged
}

export function isOnboardingFlagsMissingApiResponse(input: {
  code?: string
  message?: string
  flagsPersisted?: boolean
}): boolean {
  if (input.flagsPersisted === false || input.code === "onboarding_flags_missing") return true
  const msg = String(input.message || "")
  return /onboarding_flags/i.test(msg) && /column|컬럼|42703|PGRST204|sql\/saas_tenant_onboarding/i.test(msg)
}
