import { NextRequest, NextResponse } from "next/server"
import { assertTenantInScope, requireSaasControlPlane } from "@/lib/saas-control-plane-scope"
import { mapTenantBillingCompanyFromRow } from "@/lib/saas-billing-company-profile"
import { supabaseSelectFilterStrippingUnknownColumns } from "@/lib/supabase-pgrst204-retry"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_LIMITS_BY_TIER,
  DEFAULT_POLICY,
  DEFAULT_STAGE_PRICES,
  type TenantItem,
} from "@/lib/saas-admin-control-plane"
import {
  buildModuleInvoiceCsv,
  buildModuleInvoiceEmailHtml,
  buildModuleInvoiceHtml,
} from "@/lib/saas-module-billing"
import { normalizeModulePrices, SAAS_MODULE_LABEL_KEY } from "@/lib/saas-module-pricing"

export const dynamic = "force-dynamic"

const MODULE_LABELS_EN: Record<string, string> = Object.fromEntries(
  Object.values(SAAS_MODULE_LABEL_KEY).map((key) => [key, key.replace("saasAdminMod_", "").replace(/_/g, " ")])
)

function labelsFromLang(lang: string): Record<string, string> {
  if (lang === "ko") {
    return {
      saasAdminMod_pos_base: "POS 기본",
      saasAdminMod_pos_device: "POS 단말",
      saasAdminMod_store_ops: "매장 운영",
      saasAdminMod_kbank: "KBank",
      saasAdminMod_grab: "Grab",
      saasAdminMod_member_mgmt: "회원 CRM",
      saasAdminMod_attendance: "근태",
      saasAdminMod_cost_analysis: "원가 분석",
      saasAdminMod_work_log: "업무일지",
      saasAdminMod_notices: "공지",
      saasAdminMod_documents: "문서",
      saasAdminMod_marketing: "마케팅",
      saasAdminMod_logistics: "물류",
      saasAdminMod_accounting: "회계",
      saasAdminMod_ai_center: "AI 센터",
    }
  }
  return MODULE_LABELS_EN
}

async function loadTenantItem(tenantId: string): Promise<TenantItem | null> {
  const tenants = (await supabaseSelectFilterStrippingUnknownColumns(
    "tenants",
    `id=eq.${encodeURIComponent(tenantId)}`,
    {
      limit: 1,
      select: "id,company_name,owner_name,phone,legal_name,tax_id,billing_address,billing_email",
    },
    "saasAdminModuleInvoice tenants"
  )) as Array<{
    id: string
    company_name?: string
    owner_name?: string | null
    phone?: string | null
    legal_name?: string | null
    tax_id?: string | null
    billing_address?: string | null
    billing_email?: string | null
  }>
  const row = tenants?.[0]
  if (!row) return null

  const subs = (await supabaseSelectFilter("tenant_subscriptions", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
    limit: 1,
  })) as Record<string, unknown>[]
  const sub = subs?.[0] || {}
  const limitsRow = (await supabaseSelectFilter("tenant_limit_overrides", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
    limit: 1,
  })) as Record<string, unknown>[]
  const policyRow = (await supabaseSelectFilter("tenant_policy_settings", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
    limit: 1,
  })) as Record<string, unknown>[]
  const moduleRows = (await supabaseSelectFilter("tenant_module_pricing", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
    limit: 50,
  })) as Array<{
    module_key: string
    monthly_price?: number
    yearly_price?: number
    is_enabled?: boolean
    is_per_unit?: boolean
    is_custom_quote?: boolean
  }>

  const limits = limitsRow?.[0] || {}
  const policy = policyRow?.[0] || {}
  const planId = String(sub.plan_id || "starter_monthly")
  const [planTier, billingCycleRaw] = planId.split("_")
  const billingCycle = billingCycleRaw === "yearly" ? "yearly" : "monthly"
  const modulePrices = normalizeModulePrices(
    Object.fromEntries(
      (moduleRows || []).map((r) => [
        r.module_key,
        {
          monthly: r.monthly_price,
          yearly: r.yearly_price,
          isEnabled: r.is_enabled,
          isPerUnit: r.is_per_unit,
          isCustomQuote: r.is_custom_quote,
        },
      ])
    )
  )

  const tenant: TenantItem = {
    id: row.id,
    companyName: String(row.company_name || row.id),
    ownerName: String(row.owner_name ?? "").trim() || "-",
    phone: String(row.phone ?? "").trim() || "-",
    billingCompany: mapTenantBillingCompanyFromRow(row),
    planTier: (planTier === "enterprise" || planTier === "growth" ? planTier : "starter") as TenantItem["planTier"],
    billingCycle,
    status: (String(sub.subscription_status || "trial") as TenantItem["status"]) || "trial",
    nextBillingDate: String(sub.next_billing_at || "").slice(0, 10),
    trialEndsAt: String(sub.trial_end_at || "").slice(0, 10),
    timezone: String(policy.timezone || "Asia/Bangkok"),
    features: { ...DEFAULT_FEATURE_FLAGS },
    limits: {
      maxStores: Number(limits.max_stores ?? DEFAULT_LIMITS_BY_TIER.starter.maxStores),
      maxManagerAccounts: Number(limits.max_manager_accounts ?? DEFAULT_LIMITS_BY_TIER.starter.maxManagerAccounts),
      maxStaffAccounts: Number(limits.max_staff_accounts ?? DEFAULT_LIMITS_BY_TIER.starter.maxStaffAccounts),
      maxTablets: Number(limits.max_tablets ?? DEFAULT_LIMITS_BY_TIER.starter.maxTablets),
      maxPosDevices: Number(limits.max_pos_devices ?? DEFAULT_LIMITS_BY_TIER.starter.maxPosDevices),
      maxApiKeys: Number(limits.max_api_keys ?? DEFAULT_LIMITS_BY_TIER.starter.maxApiKeys),
      monthlyOrderQuota: Number(limits.monthly_order_quota ?? DEFAULT_LIMITS_BY_TIER.starter.monthlyOrderQuota),
    },
    policy: {
      ...DEFAULT_POLICY,
      salesStage: (String(policy.sales_stage || "basic") as TenantItem["policy"]["salesStage"]) || "basic",
      pricingMode: String(policy.pricing_mode || "module") === "stage" ? "stage" : "module",
      allowOverage: limits.allow_overage === true,
    },
    usage: { stores: 0, managerAccounts: 0, staffAccounts: 0, tablets: 0, posDevices: 0, monthlyOrders: 0 },
    pricing: {
      currency: "THB",
      pricingMode: String(policy.pricing_mode || "module") === "stage" ? "stage" : "module",
      stagePrices: { ...DEFAULT_STAGE_PRICES },
      modulePrices,
      currentChargeAmount: 0,
    },
    billingHistory: [],
    auditTrail: [],
  }
  return tenant
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  const tenantId = String(req.nextUrl.searchParams.get("tenantId") || "").trim()
  const format = String(req.nextUrl.searchParams.get("format") || "html").trim().toLowerCase()
  const lang = String(req.nextUrl.searchParams.get("lang") || "ko").trim()
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "tenantId required" }, { status: 400, headers })
  }

  const inScope = await assertTenantInScope(cp.scope, tenantId)
  if (!inScope) {
    return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
  }

  const tenant = await loadTenantItem(tenantId)
  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404, headers })
  }

  const labels = labelsFromLang(lang)
  if (format === "csv") {
    const csv = buildModuleInvoiceCsv(tenant, labels)
    headers.set("Content-Type", "text/csv; charset=utf-8")
    headers.set("Content-Disposition", `attachment; filename="saas-invoice-${tenantId}.csv"`)
    return new NextResponse(csv, { status: 200, headers })
  }

  const html = buildModuleInvoiceHtml(tenant, labels)
  headers.set("Content-Type", "text/html; charset=utf-8")
  return new NextResponse(html, { status: 200, headers })
}

type EmailBody = { tenant?: TenantItem; tenantId?: string; email?: string; note?: string; lang?: string }

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as EmailBody
    const tenantId = String(body.tenantId || body.tenant?.id || "").trim()
    const email = String(body.email || "").trim()
    const lang = String(body.lang || "ko").trim()
    if (!tenantId || !email) {
      return NextResponse.json({ success: false, message: "tenantId and email required" }, { status: 400, headers })
    }

    const inScope = await assertTenantInScope(cp.scope, tenantId)
    if (!inScope) {
      return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
    }

    const tenant = body.tenant?.id === tenantId ? body.tenant : await loadTenantItem(tenantId)
    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404, headers })
    }

    const resendKey = (process.env.RESEND_API_KEY || "").trim()
    if (!resendKey) {
      return NextResponse.json(
        {
          success: false,
          message: "RESEND_API_KEY가 설정되지 않았습니다. resend.com에서 API 키를 추가해 주세요.",
        },
        { headers }
      )
    }

    const labels = labelsFromLang(lang)
    const html = buildModuleInvoiceEmailHtml(tenant, labels, body.note)
    const subject = `[OmniFoodTech SaaS] Module billing estimate — ${tenant.companyName}`
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "onboarding@resend.dev",
        to: email,
        subject,
        html,
      }),
    })
    const data = (await res.json()) as { id?: string; message?: string }
    if (!res.ok || !data.id) {
      return NextResponse.json({ success: false, message: data.message || "Email send failed" }, { status: 500, headers })
    }
    return NextResponse.json({ success: true, message: "Invoice email sent.", emailId: data.id }, { headers })
  } catch (error) {
    console.error("saasAdminModuleInvoice POST:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
