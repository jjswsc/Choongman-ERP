import { NextRequest, NextResponse } from "next/server"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseCountFilter, supabaseSelect } from "@/lib/supabase-server"
import {
  applySalesStageFeatures,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_LIMITS_BY_TIER,
  DEFAULT_POLICY,
  DEFAULT_STAGE_PRICES,
  FALLBACK_TENANTS,
  type BillingCycle,
  type BillingEventItem,
  type FeatureFlags,
  type PlanTier,
  type StagePrice,
  type AuditLogItem,
  type SalesStage,
  type TenantItem,
  type TenantLimits,
  resolveTenantStatus,
  resolveCurrentChargeAmount,
  getBangkokMonthStartYmd,
  toBangkokStartIso,
} from "@/lib/saas-admin-control-plane"
import {
  defaultModuleCatalogRows,
  mergeTenantModulePricing,
  modulePricesFromCatalog,
  SAAS_MODULE_KEYS,
  type SaasModuleCatalogRow,
  type SaasModuleKey,
} from "@/lib/saas-module-pricing"
import {
  moduleBillingLimitsFromTenant,
  resolveEffectiveChargeWithLimits,
} from "@/lib/saas-module-billing"
import { loadLicensedPosByTenant } from "@/lib/saas-tenant-pos-licensed-server"
import { normalizePosDeviceBillingBasis, resolvePosDeviceBillingBasis } from "@/lib/saas-tenant-pos-licensed"

type TenantRow = {
  id: string
  company_name: string
  is_active?: boolean | null
}

type SubRow = {
  tenant_id: string
  plan_id?: string | null
  subscription_status?: string | null
  trial_end_at?: string | null
  next_billing_at?: string | null
  overdue_grace_days?: number | null
  auto_suspend_on_overdue?: boolean | null
  last_payment_status?: string | null
}

type PlanRow = {
  id: string
  tier?: string | null
  billing_cycle?: string | null
}

type PlanLimitRow = {
  plan_id: string
  max_stores?: number | null
  max_manager_accounts?: number | null
  max_staff_accounts?: number | null
  max_tablets?: number | null
  max_pos_devices?: number | null
  max_api_keys?: number | null
  monthly_order_quota?: number | null
}

type TenantLimitRow = {
  tenant_id: string
  max_stores?: number | null
  max_manager_accounts?: number | null
  max_staff_accounts?: number | null
  max_tablets?: number | null
  max_pos_devices?: number | null
  max_api_keys?: number | null
  monthly_order_quota?: number | null
  allow_overage?: boolean | null
}

type TenantPolicyRow = {
  tenant_id: string
  sales_stage?: SalesStage | null
  pricing_mode?: "stage" | "module" | null
  pos_device_billing_basis?: string | null
  support_tier?: "standard" | "priority" | "dedicated" | null
  require_2fa_admin?: boolean | null
  require_ip_allowlist?: boolean | null
  force_weekly_backup?: boolean | null
  data_retention_days?: number | null
}

type PlanFeatureRow = {
  plan_id: string
  feature_key: string
  is_enabled: boolean
}

type TenantFeatureRow = {
  tenant_id: string
  feature_key: string
  is_enabled: boolean
}

type BillingEventRow = {
  id: number
  tenant_id: string
  event_type?: string | null
  amount?: number | null
  currency?: string | null
  status?: string | null
  happened_at?: string | null
  memo?: string | null
}

type AuditLogRow = {
  id: number
  tenant_id: string
  action?: string | null
  actor_name?: string | null
  actor_role?: string | null
  changed_at?: string | null
  summary?: string | null
  payload_json?: unknown
}

type ModulePriceRow = {
  tenant_id: string
  module_key: string
  monthly_price?: number | null
  yearly_price?: number | null
  is_enabled?: boolean | null
  is_per_unit?: boolean | null
  is_custom_quote?: boolean | null
}

type CatalogDbRow = {
  module_key: string
  monthly_price?: number | null
  yearly_price?: number | null
  is_per_unit?: boolean | null
  is_custom_quote?: boolean | null
  sort_order?: number | null
}

function catalogRowsFromDb(raw: CatalogDbRow[]): SaasModuleCatalogRow[] {
  const defaults = defaultModuleCatalogRows()
  const byKey = new Map(defaults.map((r) => [r.moduleKey, r]))
  for (const row of raw) {
    const key = String(row.module_key || "").trim() as SaasModuleKey
    if (!SAAS_MODULE_KEYS.includes(key)) continue
    const base = byKey.get(key)!
    byKey.set(key, {
      moduleKey: key,
      monthly: Math.max(0, Number(row.monthly_price ?? base.monthly)),
      yearly: Math.max(0, Number(row.yearly_price ?? base.yearly)),
      isPerUnit: row.is_per_unit === true || base.isPerUnit,
      isCustomQuote: row.is_custom_quote === true || base.isCustomQuote,
      sortOrder: Number(row.sort_order ?? base.sortOrder),
    })
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}

function asPricingMode(raw: unknown): "stage" | "module" {
  return String(raw || "").trim().toLowerCase() === "module" ? "module" : "stage"
}

type StagePriceOverrideRow = {
  tenant_id: string
  sales_stage: SalesStage
  monthly_price?: number | null
  yearly_price?: number | null
  currency?: string | null
}

function asTier(raw: unknown): PlanTier {
  const v = String(raw || "").toLowerCase().trim()
  if (v === "enterprise") return "enterprise"
  if (v === "growth") return "growth"
  return "starter"
}

function asCycle(raw: unknown): BillingCycle {
  return String(raw || "").toLowerCase().trim() === "yearly" ? "yearly" : "monthly"
}

function mapFeatureKey(raw: string): keyof FeatureFlags | null {
  const key = String(raw || "").trim()
  if (!key) return null
  const normalized = key.replace(/[_\s-]+/g, "").toLowerCase()
  const mapped: Record<string, keyof FeatureFlags> = {
    pos: "pos",
    kitchendisplay: "kitchenDisplay",
    inventory: "inventory",
    payroll: "payroll",
    accounting: "accounting",
    analytics: "analytics",
    marketing: "marketing",
    aiassistant: "aiAssistant",
    apiaccess: "apiAccess",
    sso: "sso",
  }
  return mapped[normalized] || null
}

function defaultsByTier(tier: PlanTier): FeatureFlags {
  if (tier === "enterprise") {
    return {
      ...DEFAULT_FEATURE_FLAGS,
      inventory: true,
      payroll: true,
      accounting: true,
      marketing: true,
      aiAssistant: true,
      apiAccess: true,
      sso: true,
    }
  }
  if (tier === "growth") {
    return {
      ...DEFAULT_FEATURE_FLAGS,
      inventory: true,
      payroll: true,
      accounting: true,
    }
  }
  return { ...DEFAULT_FEATURE_FLAGS }
}

function pickLimits(base: TenantLimits, override?: TenantLimitRow): TenantLimits {
  return {
    maxStores: override?.max_stores ?? base.maxStores,
    maxManagerAccounts: override?.max_manager_accounts ?? base.maxManagerAccounts,
    maxStaffAccounts: override?.max_staff_accounts ?? base.maxStaffAccounts,
    maxTablets: override?.max_tablets ?? base.maxTablets,
    maxPosDevices: override?.max_pos_devices ?? base.maxPosDevices,
    maxApiKeys: override?.max_api_keys ?? base.maxApiKeys,
    monthlyOrderQuota: override?.monthly_order_quota ?? base.monthlyOrderQuota,
  }
}

async function countSafe(filter: string, table: string): Promise<number> {
  try {
    return await supabaseCountFilter(table, filter)
  } catch {
    return 0
  }
}

async function selectSafe(table: string, options: { order?: string; limit?: number } = {}) {
  try {
    return (await supabaseSelect(table, options)) as unknown[]
  } catch {
    return []
  }
}

async function buildUsage(tenantId: string) {
  const tenant = encodeURIComponent(tenantId)
  const monthStart = getBangkokMonthStartYmd()
  const monthStartIso = toBangkokStartIso(monthStart)
  const stores = await countSafe(`tenant_id=eq.${tenant}`, "erp_stores")
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

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const tenants = (await supabaseSelect("tenants", { order: "created_at.asc", limit: 300 })) as TenantRow[]
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return NextResponse.json({ success: true, tenants: [] }, { headers })
    }

    const [subs, plans, planLimits, tenantLimits, tenantPolicies, planFeatures, tenantFeatures, billingRows, auditRows, stagePriceRows, modulePriceRows, catalogDbRows] =
      (await Promise.all([
        supabaseSelect("tenant_subscriptions", { limit: 400 }),
        supabaseSelect("saas_plans", { limit: 100 }),
        supabaseSelect("saas_plan_limits", { limit: 100 }),
        supabaseSelect("tenant_limit_overrides", { limit: 400 }),
        supabaseSelect("tenant_policy_settings", { limit: 400 }),
        supabaseSelect("saas_plan_features", { limit: 2000 }),
        supabaseSelect("tenant_feature_overrides", { limit: 4000 }),
        selectSafe("saas_billing_events", { order: "happened_at.desc", limit: 500 }),
        selectSafe("saas_audit_logs", { order: "changed_at.desc", limit: 500 }),
        selectSafe("tenant_stage_price_overrides", { limit: 5000 }),
        selectSafe("tenant_module_pricing", { limit: 10000 }),
        selectSafe("saas_module_price_catalog", { order: "sort_order.asc", limit: 100 }),
      ])) as [
        SubRow[],
        PlanRow[],
        PlanLimitRow[],
        TenantLimitRow[],
        TenantPolicyRow[],
        PlanFeatureRow[],
        TenantFeatureRow[],
        BillingEventRow[],
        AuditLogRow[],
        StagePriceOverrideRow[],
        ModulePriceRow[],
        CatalogDbRow[],
      ]

    const catalogRows =
      Array.isArray(catalogDbRows) && catalogDbRows.length > 0
        ? catalogRowsFromDb(catalogDbRows)
        : defaultModuleCatalogRows()
    const catalogModulePrices = modulePricesFromCatalog(catalogRows)

    const subMap = new Map((subs || []).map((x) => [x.tenant_id, x]))
    const planMap = new Map((plans || []).map((x) => [x.id, x]))
    const planLimitMap = new Map((planLimits || []).map((x) => [x.plan_id, x]))
    const tenantLimitMap = new Map((tenantLimits || []).map((x) => [x.tenant_id, x]))
    const tenantPolicyMap = new Map((tenantPolicies || []).map((x) => [x.tenant_id, x]))
    const planFeaturesMap = new Map<string, FeatureFlags>()
    const tenantFeaturesMap = new Map<string, Partial<FeatureFlags>>()
    const billingMap = new Map<string, BillingEventItem[]>()
    const auditMap = new Map<string, AuditLogItem[]>()
    const stagePriceMap = new Map<string, Record<SalesStage, StagePrice>>()
    const currencyMap = new Map<string, string>()

    for (const row of planFeatures || []) {
      const mapped = mapFeatureKey(row.feature_key)
      if (!mapped) continue
      const prev = planFeaturesMap.get(row.plan_id) || { ...DEFAULT_FEATURE_FLAGS }
      prev[mapped] = row.is_enabled === true
      planFeaturesMap.set(row.plan_id, prev)
    }
    for (const row of tenantFeatures || []) {
      const mapped = mapFeatureKey(row.feature_key)
      if (!mapped) continue
      const prev = tenantFeaturesMap.get(row.tenant_id) || {}
      prev[mapped] = row.is_enabled === true
      tenantFeaturesMap.set(row.tenant_id, prev)
    }
    for (const row of (billingRows as BillingEventRow[]) || []) {
      const key = String(row.tenant_id || "").trim()
      if (!key) continue
      const prev = billingMap.get(key) || []
      if (prev.length >= 20) continue
      prev.push({
        id: Number(row.id || 0),
        eventType: String(row.event_type || "billing.updated"),
        amount: Number(row.amount || 0),
        currency: String(row.currency || "THB"),
        status: String(row.status || "unknown"),
        happenedAt: String(row.happened_at || ""),
        memo: String(row.memo || ""),
      })
      billingMap.set(key, prev)
    }
    for (const row of (auditRows as AuditLogRow[]) || []) {
      const key = String(row.tenant_id || "").trim()
      if (!key) continue
      const prev = auditMap.get(key) || []
      if (prev.length >= 20) continue
      const payload = row.payload_json
      const employeeId =
        payload && typeof payload === "object" && "employeeId" in (payload as Record<string, unknown>)
          ? Number((payload as Record<string, unknown>).employeeId || 0)
          : 0
      prev.push({
        id: Number(row.id || 0),
        action: String(row.action || "tenant.settings.updated"),
        actorName: String(row.actor_name || "-"),
        actorRole: String(row.actor_role || "-"),
        changedAt: String(row.changed_at || ""),
        summary: String(row.summary || ""),
        employeeId: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
      })
      auditMap.set(key, prev)
    }
    for (const row of stagePriceRows || []) {
      const key = String(row.tenant_id || "").trim()
      const stageRaw = String(row.sales_stage || "").trim()
      const stage = (["basic", "payment", "delivery", "erp1", "erp2", "ai"].includes(stageRaw)
        ? stageRaw
        : "basic") as SalesStage
      if (!key) continue
      const prev = stagePriceMap.get(key) || { ...DEFAULT_STAGE_PRICES }
      prev[stage] = {
        monthly: Number(row.monthly_price ?? prev[stage]?.monthly ?? 0),
        yearly: Number(row.yearly_price ?? prev[stage]?.yearly ?? 0),
      }
      stagePriceMap.set(key, prev)
      if (row.currency) currencyMap.set(key, String(row.currency))
    }

    const rows: TenantItem[] = []
    const licensedPosMap = await loadLicensedPosByTenant()
    for (const tenant of tenants) {
      const sub = subMap.get(tenant.id)
      const plan = sub?.plan_id ? planMap.get(sub.plan_id) : undefined
      const tier = asTier(plan?.tier)
      const cycle = asCycle(plan?.billing_cycle)
      const baseLimits = DEFAULT_LIMITS_BY_TIER[tier]
      const planLimit = sub?.plan_id ? planLimitMap.get(sub.plan_id) : undefined
      const mergedPlanLimit = pickLimits(
        {
          ...baseLimits,
          ...(planLimit
            ? {
                maxStores: planLimit.max_stores ?? baseLimits.maxStores,
                maxManagerAccounts: planLimit.max_manager_accounts ?? baseLimits.maxManagerAccounts,
                maxStaffAccounts: planLimit.max_staff_accounts ?? baseLimits.maxStaffAccounts,
                maxTablets: planLimit.max_tablets ?? baseLimits.maxTablets,
                maxPosDevices: planLimit.max_pos_devices ?? baseLimits.maxPosDevices,
                maxApiKeys: planLimit.max_api_keys ?? baseLimits.maxApiKeys,
                monthlyOrderQuota: planLimit.monthly_order_quota ?? baseLimits.monthlyOrderQuota,
              }
            : {}),
        },
        tenantLimitMap.get(tenant.id)
      )

      const features = {
        ...defaultsByTier(tier),
        ...(sub?.plan_id ? planFeaturesMap.get(sub.plan_id) : {}),
        ...(tenantFeaturesMap.get(tenant.id) || {}),
      }
      const policyRow = tenantPolicyMap.get(tenant.id)
      const salesStage = (policyRow?.sales_stage || DEFAULT_POLICY.salesStage) as SalesStage
      const stagedFeatures = applySalesStageFeatures(features, salesStage)
      const policyLimit = tenantLimitMap.get(tenant.id)
      const trialEndYmd = String(sub?.trial_end_at || "").slice(0, 10)
      const nextBillingYmd = String(sub?.next_billing_at || "").slice(0, 10)
      const status = resolveTenantStatus({
        explicitStatus: sub?.subscription_status || (tenant.is_active === false ? "suspended" : "active"),
        trialEndYmd,
        nextBillingYmd,
        overdueGraceDays: sub?.overdue_grace_days ?? DEFAULT_POLICY.overdueGraceDays,
        autoSuspendOnOverdue: sub?.auto_suspend_on_overdue ?? DEFAULT_POLICY.autoSuspendOnOverdue,
        lastPaymentStatus: sub?.last_payment_status || null,
      })
      const usageRaw = await buildUsage(tenant.id)
      const licensedPosDevices = licensedPosMap.get(tenant.id) ?? 0
      const usage = { ...usageRaw, licensedPosDevices }
      const stagePrices = stagePriceMap.get(tenant.id) || { ...DEFAULT_STAGE_PRICES }
      const currency = currencyMap.get(tenant.id) || "THB"
      const pricingMode = asPricingMode(policyRow?.pricing_mode)
      const posDeviceBillingBasis = resolvePosDeviceBillingBasis(
        tenant.id,
        pricingMode,
        normalizePosDeviceBillingBasis(policyRow?.pos_device_billing_basis, pricingMode)
      )
      if (posDeviceBillingBasis === "erp_admin" && licensedPosDevices > 0) {
        mergedPlanLimit.maxPosDevices = licensedPosDevices
      }
      const modulePrices = mergeTenantModulePricing({
        catalog: catalogModulePrices,
        tenantRows: modulePriceRows || [],
        tenantId: tenant.id,
      })
      const stageAmount = resolveCurrentChargeAmount(salesStage, cycle, stagePrices)
      const policyForLimits = {
        salesStage,
        pricingMode,
        posDeviceBillingBasis,
        autoSuspendOnOverdue: sub?.auto_suspend_on_overdue ?? DEFAULT_POLICY.autoSuspendOnOverdue,
        allowOverage: policyLimit?.allow_overage ?? DEFAULT_POLICY.allowOverage,
        require2faAdmin: policyRow?.require_2fa_admin ?? DEFAULT_POLICY.require2faAdmin,
        requireIpAllowlist: policyRow?.require_ip_allowlist ?? DEFAULT_POLICY.requireIpAllowlist,
        forceWeeklyBackup: policyRow?.force_weekly_backup ?? DEFAULT_POLICY.forceWeeklyBackup,
        dataRetentionDays: policyRow?.data_retention_days ?? DEFAULT_POLICY.dataRetentionDays,
        overdueGraceDays: sub?.overdue_grace_days ?? DEFAULT_POLICY.overdueGraceDays,
        supportTier: policyRow?.support_tier ?? DEFAULT_POLICY.supportTier,
      }
      const currentChargeAmount = resolveEffectiveChargeWithLimits({
        pricingMode,
        billingCycle: cycle,
        stageAmount,
        modulePrices,
        usage,
        limits: moduleBillingLimitsFromTenant({
          id: tenant.id,
          limits: mergedPlanLimit,
          policy: policyForLimits,
          usage,
        }),
      })

      rows.push({
        id: tenant.id,
        companyName: tenant.company_name || tenant.id,
        ownerName: "-",
        phone: "-",
        planTier: tier,
        billingCycle: cycle,
        status,
        nextBillingDate: nextBillingYmd,
        trialEndsAt: trialEndYmd,
        timezone: "Asia/Bangkok",
        features: stagedFeatures,
        limits: mergedPlanLimit,
        policy: policyForLimits,
        usage,
        pricing: {
          currency,
          pricingMode,
          stagePrices,
          modulePrices,
          currentChargeAmount,
        },
        billingHistory: billingMap.get(tenant.id) || [],
        auditTrail: auditMap.get(tenant.id) || [],
      })
    }

    return NextResponse.json({ success: true, tenants: rows }, { headers })
  } catch (error) {
    console.error("getSaasTenantSettings:", error)
    return NextResponse.json(
      {
        success: true,
        fallback: true,
        message: "제어 평면 테이블이 아직 적용되지 않아 샘플 데이터로 표시합니다.",
        tenants: FALLBACK_TENANTS,
      },
      { headers }
    )
  }
}
