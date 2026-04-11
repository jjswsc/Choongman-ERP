import { NextRequest, NextResponse } from "next/server"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseInsert, supabaseUpsert, supabaseUpsertMerge } from "@/lib/supabase-server"
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
    const stagePrices = normalizeStagePrices(tenant.pricing?.stagePrices)
    const currency = String(tenant.pricing?.currency || "THB").trim() || "THB"
    const currentChargeAmount = resolveCurrentChargeAmount(salesStage, billingCycle, stagePrices)
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
            stagePrices,
            currentChargeAmount,
          },
        },
        changed_at: nowIso,
      })
    } catch (logError) {
      console.warn("saveSaasTenantSettings audit log skipped:", logError)
    }
    try {
      await supabaseInsert("saas_billing_events", {
        tenant_id: tenantId,
        event_type: "subscription.updated",
        amount: currentChargeAmount,
        currency,
        status: tenant.status === "suspended" ? "attention" : "ok",
        memo: `plan=${planTier}/${billingCycle}, stage=${salesStage}, nextBilling=${tenant.nextBillingDate || "-"}`,
        happened_at: nowIso,
      })
    } catch (billingError) {
      console.warn("saveSaasTenantSettings billing event skipped:", billingError)
    }

    return NextResponse.json({ success: true, tenantId }, { headers })
  } catch (error) {
    console.error("saveSaasTenantSettings:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
