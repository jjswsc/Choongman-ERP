import { NextRequest, NextResponse } from "next/server"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseInsert, supabaseSelectFilter, supabaseUpsert, supabaseUpsertMerge } from "@/lib/supabase-server"
import {
  applySalesStageFeatures,
  DEFAULT_LIMITS_BY_TIER,
  DEFAULT_STAGE_PRICES,
  FEATURE_KEYS,
  type BillingCycle,
  type PlanTier,
  type SalesStage,
  type StagePrice,
  type SupportTier,
  type TenantItem,
  resolveCurrentChargeAmount,
  toBangkokStartIso,
} from "@/lib/saas-admin-control-plane"
import {
  buildModuleBillingMemo,
  diffModulePricing,
  moduleBillingLimitsFromTenant,
  resolveEffectiveChargeWithLimits,
  resolveModuleChargeWithLimits,
  summarizeModulePricingChanges,
} from "@/lib/saas-module-billing"
import { normalizePosDeviceBillingBasis, resolvePosDeviceBillingBasis } from "@/lib/saas-tenant-pos-licensed"
import {
  defaultModuleCatalogRows,
  mergeTenantModulePricing,
  modulePricesFromCatalog,
  normalizeModulePrices,
  SAAS_MODULE_KEYS,
  type SaasModuleKey,
  type SaasModulePriceRow,
} from "@/lib/saas-module-pricing"

type SaveBody = {
  tenant: TenantItem
}

function normalizeTier(raw: unknown): PlanTier {
  const v = String(raw || "").toLowerCase().trim()
  if (v === "enterprise") return "enterprise"
  if (v === "growth") return "growth"
  return "starter"
}

function normalizeCycle(raw: unknown): BillingCycle {
  return String(raw || "").toLowerCase().trim() === "yearly" ? "yearly" : "monthly"
}

function normalizeSupport(raw: unknown): SupportTier {
  const v = String(raw || "").toLowerCase().trim()
  if (v === "priority") return "priority"
  if (v === "dedicated") return "dedicated"
  return "standard"
}

function toFeatureStorageKey(input: string): string {
  return input.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
}

function normalizeSalesStage(raw: unknown): SalesStage {
  const v = String(raw || "").toLowerCase().trim()
  if (v === "payment") return "payment"
  if (v === "delivery") return "delivery"
  if (v === "erp1") return "erp1"
  if (v === "erp2") return "erp2"
  if (v === "ai") return "ai"
  return "basic"
}

function buildAuditSummary(tenant: TenantItem): string {
  return [
    `plan=${tenant.planTier}/${tenant.billingCycle}`,
    `status=${tenant.status}`,
    `stores=${tenant.limits.maxStores}`,
    `tablets=${tenant.limits.maxTablets}`,
    `pos=${tenant.limits.maxPosDevices}`,
    `quota=${tenant.limits.monthlyOrderQuota}`,
  ].join(", ")
}

function normalizePricingMode(raw: unknown): "stage" | "module" {
  return String(raw || "").trim().toLowerCase() === "module" ? "module" : "stage"
}

function normalizeModulePricesFromTenant(raw: unknown): Record<SaasModuleKey, SaasModulePriceRow> {
  return normalizeModulePrices(raw)
}

async function loadPreviousModulePrices(tenantId: string): Promise<Record<SaasModuleKey, SaasModulePriceRow> | null> {
  try {
    const rows = (await supabaseSelectFilter("tenant_module_pricing", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 50,
    })) as Array<{
      tenant_id: string
      module_key: string
      monthly_price?: number | null
      yearly_price?: number | null
      is_enabled?: boolean | null
      is_per_unit?: boolean | null
      is_custom_quote?: boolean | null
    }>
    if (!Array.isArray(rows) || rows.length === 0) return null
    const catalog = modulePricesFromCatalog(defaultModuleCatalogRows())
    return mergeTenantModulePricing({ catalog, tenantRows: rows, tenantId })
  } catch {
    return null
  }
}

async function loadLastBillingAmount(tenantId: string): Promise<number | null> {
  try {
    const rows = (await supabaseSelectFilter("saas_billing_events", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
      order: "happened_at.desc",
      limit: 1,
    })) as Array<{ amount?: number | null }>
    const hit = rows?.[0]
    if (!hit) return null
    return Number(hit.amount ?? NaN)
  } catch {
    return null
  }
}

function normalizeStagePrices(raw: unknown): Record<SalesStage, StagePrice> {
  const base = { ...DEFAULT_STAGE_PRICES }
  if (!raw || typeof raw !== "object") return base
  const obj = raw as Record<string, { monthly?: unknown; yearly?: unknown }>
  ;(["basic", "payment", "delivery", "erp1", "erp2", "ai"] as SalesStage[]).forEach((stage) => {
    const row = obj[stage]
    if (!row) return
    base[stage] = {
      monthly: Math.max(0, Number(row.monthly ?? base[stage].monthly)),
      yearly: Math.max(0, Number(row.yearly ?? base[stage].yearly)),
    }
  })
  return base
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as SaveBody
    const tenant = body?.tenant
    const tenantId = String(tenant?.id || "").trim()
    const companyName = String(tenant?.companyName || "").trim()
    if (!tenantId || !companyName) {
      return NextResponse.json({ success: false, message: "tenant.id/companyName이 필요합니다." }, { status: 400, headers })
    }

    const planTier = normalizeTier(tenant.planTier)
    const billingCycle = normalizeCycle(tenant.billingCycle)
    const planId = `${planTier}_${billingCycle}`
    const baseLimit = DEFAULT_LIMITS_BY_TIER[planTier]
    const nowIso = new Date().toISOString()
    const salesStage = normalizeSalesStage(tenant.policy.salesStage)
    const pricingMode = normalizePricingMode(tenant.policy.pricingMode ?? tenant.pricing?.pricingMode)
    const posDeviceBillingBasis = resolvePosDeviceBillingBasis(
      tenantId,
      pricingMode,
      normalizePosDeviceBillingBasis(tenant.policy.posDeviceBillingBasis, pricingMode)
    )
    const stagePrices = normalizeStagePrices(tenant.pricing?.stagePrices)
    const modulePrices = normalizeModulePricesFromTenant(tenant.pricing?.modulePrices)
    const currency = String(tenant.pricing?.currency || "THB").trim() || "THB"
    const stageAmount = resolveCurrentChargeAmount(salesStage, billingCycle, stagePrices)
    const billingLimits = moduleBillingLimitsFromTenant(tenant)
    const chargeForBilling = resolveEffectiveChargeWithLimits({
      pricingMode,
      billingCycle,
      stageAmount,
      modulePrices,
      usage: tenant.usage,
      limits: billingLimits,
    })
    const moduleBreakdown =
      pricingMode === "module"
        ? resolveModuleChargeWithLimits(modulePrices, billingCycle, tenant.usage, billingLimits)
        : null

    const previousModulePrices = await loadPreviousModulePrices(tenantId)
    const moduleChanges = diffModulePricing(previousModulePrices, modulePrices)
    const previousBillingAmount = await loadLastBillingAmount(tenantId)
    const trialIso = toBangkokStartIso(String(tenant.trialEndsAt || "").slice(0, 10))
    const nextBillingIso = toBangkokStartIso(String(tenant.nextBillingDate || "").slice(0, 10))
    const graceDays = Math.max(0, Math.floor(Number(tenant.policy.overdueGraceDays || 0)))

    await supabaseUpsertMerge("tenants", "id", {
      id: tenantId,
      company_name: companyName,
      is_active: tenant.status !== "suspended",
    })

    await supabaseUpsertMerge("saas_plans", "id", {
      id: planId,
      plan_name: `${planTier.toUpperCase()} ${billingCycle === "yearly" ? "YEARLY" : "MONTHLY"}`,
      tier: planTier,
      billing_cycle: billingCycle,
      is_active: true,
      updated_at: nowIso,
    })

    await supabaseUpsertMerge("saas_plan_limits", "plan_id", {
      plan_id: planId,
      max_stores: baseLimit.maxStores,
      max_manager_accounts: baseLimit.maxManagerAccounts,
      max_staff_accounts: baseLimit.maxStaffAccounts,
      max_tablets: baseLimit.maxTablets,
      max_pos_devices: baseLimit.maxPosDevices,
      max_api_keys: baseLimit.maxApiKeys,
      monthly_order_quota: baseLimit.monthlyOrderQuota,
      updated_at: nowIso,
    })

    await supabaseUpsertMerge("tenant_subscriptions", "tenant_id", {
      tenant_id: tenantId,
      plan_id: planId,
      subscription_status: tenant.status,
      trial_end_at: trialIso,
      next_billing_at: nextBillingIso,
      overdue_grace_days: graceDays,
      auto_suspend_on_overdue: tenant.policy.autoSuspendOnOverdue,
      last_payment_status: tenant.status === "active" ? "paid" : "unpaid",
      updated_at: nowIso,
    })

    await supabaseUpsertMerge("tenant_limit_overrides", "tenant_id", {
      tenant_id: tenantId,
      max_stores: tenant.limits.maxStores,
      max_manager_accounts: tenant.limits.maxManagerAccounts,
      max_staff_accounts: tenant.limits.maxStaffAccounts,
      max_tablets: tenant.limits.maxTablets,
      max_pos_devices: tenant.limits.maxPosDevices,
      max_api_keys: tenant.limits.maxApiKeys,
      monthly_order_quota: tenant.limits.monthlyOrderQuota,
      allow_overage: tenant.policy.allowOverage,
      updated_at: nowIso,
    })

    try {
      await supabaseUpsertMerge("tenant_policy_settings", "tenant_id", {
        tenant_id: tenantId,
        sales_stage: salesStage,
        pricing_mode: pricingMode,
        pos_device_billing_basis: posDeviceBillingBasis,
        support_tier: normalizeSupport(tenant.policy.supportTier),
        require_2fa_admin: tenant.policy.require2faAdmin,
        require_ip_allowlist: tenant.policy.requireIpAllowlist,
        force_weekly_backup: tenant.policy.forceWeeklyBackup,
        data_retention_days: Math.max(30, Math.floor(Number(tenant.policy.dataRetentionDays || 365))),
        timezone: tenant.timezone || "Asia/Bangkok",
        updated_at: nowIso,
      })
    } catch (policyError) {
      // 구 스키마 호환: sales_stage 컬럼이 아직 없으면 기존 컬럼만 저장
      await supabaseUpsertMerge("tenant_policy_settings", "tenant_id", {
        tenant_id: tenantId,
        support_tier: normalizeSupport(tenant.policy.supportTier),
        require_2fa_admin: tenant.policy.require2faAdmin,
        require_ip_allowlist: tenant.policy.requireIpAllowlist,
        force_weekly_backup: tenant.policy.forceWeeklyBackup,
        data_retention_days: Math.max(30, Math.floor(Number(tenant.policy.dataRetentionDays || 365))),
        timezone: tenant.timezone || "Asia/Bangkok",
        updated_at: nowIso,
      })
      console.warn("saveSaasTenantSettings: sales_stage column not ready, fallback used", policyError)
    }

    const stagedFeatures = applySalesStageFeatures(tenant.features, salesStage)
    const featureRows = FEATURE_KEYS.map((featureKey) => ({
      tenant_id: tenantId,
      feature_key: toFeatureStorageKey(featureKey),
      is_enabled: stagedFeatures[featureKey] === true,
      updated_at: nowIso,
    }))
    await supabaseUpsert("tenant_feature_overrides", featureRows, "tenant_id,feature_key")

    try {
      const stageRows = (["basic", "payment", "delivery", "erp1", "erp2", "ai"] as SalesStage[]).map((stage) => ({
        tenant_id: tenantId,
        sales_stage: stage,
        monthly_price: Math.max(0, Number(stagePrices[stage].monthly || 0)),
        yearly_price: Math.max(0, Number(stagePrices[stage].yearly || 0)),
        currency,
        updated_at: nowIso,
      }))
      await supabaseUpsert(
        "tenant_stage_price_overrides",
        stageRows,
        "tenant_id,sales_stage"
      )
    } catch (stagePriceError) {
      console.warn("saveSaasTenantSettings stage price save skipped:", stagePriceError)
    }

    try {
      const moduleRows = SAAS_MODULE_KEYS.map((moduleKey) => {
        const row = modulePrices[moduleKey]
        return {
          tenant_id: tenantId,
          module_key: moduleKey,
          monthly_price: Math.max(0, Number(row.monthly || 0)),
          yearly_price: Math.max(0, Number(row.yearly || 0)),
          is_enabled: row.isEnabled === true,
          is_per_unit: row.isPerUnit === true,
          is_custom_quote: row.isCustomQuote === true,
          updated_at: nowIso,
        }
      })
      await supabaseUpsert("tenant_module_pricing", moduleRows, "tenant_id,module_key")
    } catch (modulePriceError) {
      console.warn("saveSaasTenantSettings module price save skipped:", modulePriceError)
    }

    // 감사로그/과금이력은 보조 테이블이므로, 미적용 환경에서도 저장 본체는 성공 처리한다.
    try {
      await supabaseInsert("saas_audit_logs", {
        tenant_id: tenantId,
        action: "tenant.settings.updated",
        actor_name: authResult.auth.name || "unknown",
        actor_role: authResult.auth.role || "unknown",
        summary: buildAuditSummary(tenant),
        payload_json: {
          planTier: planTier,
          billingCycle: billingCycle,
          salesStage,
          status: tenant.status,
          limits: tenant.limits,
          policy: tenant.policy,
          features: tenant.features,
          pricing: {
            currency,
            pricingMode,
            stagePrices,
            modulePrices,
            currentChargeAmount: chargeForBilling,
          },
        },
        changed_at: nowIso,
      })
    } catch (logError) {
      console.warn("saveSaasTenantSettings audit log skipped:", logError)
    }

    if (moduleChanges.length > 0) {
      try {
        await supabaseInsert("saas_audit_logs", {
          tenant_id: tenantId,
          action: "tenant.module_pricing.updated",
          actor_name: authResult.auth.name || "unknown",
          actor_role: authResult.auth.role || "unknown",
          summary: summarizeModulePricingChanges(moduleChanges),
          payload_json: {
            changes: moduleChanges.map((c) => ({
              moduleKey: c.moduleKey,
              before: c.before,
              after: c.after,
            })),
            pricingMode,
            chargeAmount: chargeForBilling,
          },
          changed_at: nowIso,
        })
      } catch (moduleAuditError) {
        console.warn("saveSaasTenantSettings module audit skipped:", moduleAuditError)
      }
    }

    const shouldRecordBilling =
      previousBillingAmount == null ||
      previousBillingAmount !== chargeForBilling ||
      moduleChanges.length > 0

    try {
      if (shouldRecordBilling) {
        await supabaseInsert("saas_billing_events", {
          tenant_id: tenantId,
          event_type: pricingMode === "module" ? "module.charge.updated" : "subscription.updated",
          amount: chargeForBilling,
          currency,
          status: tenant.status === "suspended" ? "attention" : moduleBreakdown?.capped ? "warning" : "ok",
          memo: buildModuleBillingMemo({
            pricingMode,
            salesStage,
            billingCycle,
            amount: chargeForBilling,
            currency,
            breakdown: moduleBreakdown ?? undefined,
            pos: moduleBreakdown
              ? {
                  reported: moduleBreakdown.reported,
                  billable: moduleBreakdown.billable,
                  capped: moduleBreakdown.capped,
                  basis: moduleBreakdown.basis,
                }
              : undefined,
          }),
          happened_at: nowIso,
        })
      }
    } catch (billingError) {
      console.warn("saveSaasTenantSettings billing event skipped:", billingError)
    }

    return NextResponse.json({ success: true, tenantId }, { headers })
  } catch (error) {
    console.error("saveSaasTenantSettings:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
