import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_LIMITS_BY_TIER,
  DEFAULT_POLICY,
  DEFAULT_STAGE_PRICES,
  type TenantItem,
} from "./saas-admin-control-plane"
import { buildNewTenantPricing } from "./saas-module-billing"
import type { SaasModuleKey, SaasModulePriceRow } from "./saas-module-pricing"
import { resolvePosDeviceBillingBasis } from "./saas-tenant-pos-licensed"

export type NewTenantDraftInput = {
  id: string
  companyName: string
  ownerName?: string
  phone?: string
  catalog: Record<SaasModuleKey, SaasModulePriceRow>
}

export function createNewTenantDraft(input: NewTenantDraftInput): TenantItem {
  const id = input.id.trim().toLowerCase()
  const companyName = input.companyName.trim()
  const policy = {
    ...DEFAULT_POLICY,
    pricingMode: "module" as const,
    posDeviceBillingBasis: resolvePosDeviceBillingBasis(id, "module"),
  }
  const limits = { ...DEFAULT_LIMITS_BY_TIER.starter }
  const features = { ...DEFAULT_FEATURE_FLAGS }
  const usage = {
    stores: 0,
    managerAccounts: 0,
    staffAccounts: 0,
    tablets: 0,
    posDevices: 0,
    monthlyOrders: 0,
  }
  return {
    id,
    companyName,
    ownerName: input.ownerName?.trim() || "-",
    phone: input.phone?.trim() || "-",
    planTier: "starter",
    billingCycle: "monthly",
    status: "trial",
    nextBillingDate: "",
    trialEndsAt: "",
    timezone: "Asia/Bangkok",
    features,
    limits,
    policy,
    usage,
    pricing: buildNewTenantPricing({
      catalog: input.catalog,
      features,
      salesStage: policy.salesStage,
      billingCycle: "monthly",
      stagePrices: { ...DEFAULT_STAGE_PRICES },
      usage,
      limits,
      policy,
    }),
    billingHistory: [],
    auditTrail: [],
  }
}
